import type { FrameMeta, StitchResult } from '../types'
import { CONFIG } from '../config'
import { clamp, degToRad, wrapTwoPi } from '../math/angles'
import { worldToCamera } from '../math/rotation'
import {
  intrinsicsFromHfov,
  verticalFov,
  type CameraIntrinsics,
} from './projection'
import { featherHorizontal } from './blending'
import { canvasToBlob } from '../media'

export interface StitchOptions {
  hfovDeg: number
  outputWidth?: number
  outputHeight?: number
  mimeType?: 'image/jpeg' | 'image/webp'
  quality?: number
  /** per-frame refined orientations (yaw/pitch/roll) from ORB alignment */
  orientations?: Array<{ yaw: number; pitch: number; roll: number }>
  onProgress?: (ratio: number) => void
}

/** A decoded, downscaled frame ready for projection. */
export interface DecodedFrame {
  yaw: number
  pitch: number
  roll: number
  data: Uint8ClampedArray
  width: number
  height: number
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解码失败'))
    }
    img.src = url
  })
}

async function decodeFrame(
  blob: Blob,
  maxWidth: number,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  let source: ImageBitmap | HTMLImageElement
  let srcWidth: number
  let srcHeight: number
  try {
    const bmp = await createImageBitmap(blob)
    source = bmp
    srcWidth = bmp.width
    srcHeight = bmp.height
  } catch {
    const img = await loadImage(blob)
    source = img
    srcWidth = img.naturalWidth
    srcHeight = img.naturalHeight
  }

  const scale = Math.min(1, maxWidth / srcWidth)
  const w = Math.max(1, Math.round(srcWidth * scale))
  const h = Math.max(1, Math.round(srcHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(source, 0, 0, w, h)
  if ('close' in source && typeof (source as ImageBitmap).close === 'function') {
    ;(source as ImageBitmap).close()
  }
  const imgData = ctx.getImageData(0, 0, w, h)
  return { data: imgData.data, width: w, height: h }
}

function sampleBilinear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  u: number,
  v: number,
): [number, number, number] {
  const x0 = Math.floor(u)
  const y0 = Math.floor(v)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const fx = u - x0
  const fy = v - y0
  const i00 = (y0 * w + x0) * 4
  const i10 = (y0 * w + x1) * 4
  const i01 = (y1 * w + x0) * 4
  const i11 = (y1 * w + x1) * 4

  const r =
    (data[i00] * (1 - fx) + data[i10] * fx) * (1 - fy) +
    (data[i01] * (1 - fx) + data[i11] * fx) * fy
  const g =
    (data[i00 + 1] * (1 - fx) + data[i10 + 1] * fx) * (1 - fy) +
    (data[i01 + 1] * (1 - fx) + data[i11 + 1] * fx) * fy
  const b =
    (data[i00 + 2] * (1 - fx) + data[i10 + 2] * fx) * (1 - fy) +
    (data[i01 + 2] * (1 - fx) + data[i11 + 2] * fx) * fy
  return [r, g, b]
}

/**
 * Decode all frames into downscaled pixel buffers once, so subsequent
 * stitches (FOV preview / export) only re-project without re-decoding.
 */
export async function decodeFrames(
  frames: FrameMeta[],
  maxWidth: number = CONFIG.stitchSourceMaxWidth,
  onProgress?: (ratio: number) => void,
): Promise<DecodedFrame[]> {
  const out: DecodedFrame[] = []
  const total = frames.length
  for (let i = 0; i < total; i++) {
    const fr = frames[i]
    const { data, width, height } = await decodeFrame(fr.blob, maxWidth)
    out.push({
      yaw: wrapTwoPi(fr.yaw),
      pitch: fr.pitch,
      roll: fr.roll,
      data,
      width,
      height,
    })
    onProgress?.(0.1 * ((i + 1) / total))
  }
  out.sort((a, b) => a.yaw - b.yaw)
  return out
}

interface PreparedFrame extends DecodedFrame {
  intrinsics: CameraIntrinsics
}

/**
 * Project and blend already-decoded frames into an equirectangular panorama.
 * Assumes the camera rotated in place (rotation-only, no translation).
 */
export async function stitchDecoded(
  decoded: DecodedFrame[],
  opts: StitchOptions,
): Promise<StitchResult> {
  if (decoded.length === 0) throw new Error('没有可拼接的照片')

  const outW = opts.outputWidth ?? CONFIG.outputWidth
  const outH = opts.outputHeight ?? CONFIG.outputHeight
  const hfovDeg = opts.hfovDeg
  const quality = opts.quality ?? 0.9
  const mimeType = opts.mimeType ?? 'image/jpeg'

  const prepared: PreparedFrame[] = decoded.map((d) => ({
    ...d,
    intrinsics: intrinsicsFromHfov(d.width, d.height, hfovDeg),
  }))

  const N = outW * outH
  // winner-take-all: keep the colour from the frame whose projection is
  // closest to its center. This removes double-image ghosting entirely
  // (each pixel comes from a single frame).
  const bestR = new Float32Array(N)
  const bestG = new Float32Array(N)
  const bestB = new Float32Array(N)
  const bestW = new Float32Array(N)

  const twoPi = Math.PI * 2
  const halfHfov = degToRad(hfovDeg) / 2
  const vfov = verticalFov(hfovDeg, prepared[0].width, prepared[0].height)
  const halfVfov = vfov / 2

  for (let fi = 0; fi < prepared.length; fi++) {
    const p = prepared[fi]
    const cam = p.intrinsics
    const o = opts.orientations?.[fi] ?? p
    const R = worldToCamera(o.yaw, o.pitch, o.roll)

    // longitude coverage widens by 1/cos(pitch) near the poles
    const cosP = Math.max(0.06, Math.abs(Math.cos(o.pitch)))
    const lonHalf = Math.min(Math.PI, halfHfov / cosP)
    const xCenter = (o.yaw / twoPi) * outW
    const xHalf = (lonHalf / twoPi) * outW
    const xStart = Math.floor(xCenter - xHalf)
    const xEnd = Math.ceil(xCenter + xHalf)

    const phiTop = o.pitch + halfVfov
    const phiBottom = o.pitch - halfVfov
    const yTop = clamp(Math.floor((0.5 - phiTop / Math.PI) * outH), 0, outH - 1)
    const yBottom = clamp(
      Math.ceil((0.5 - phiBottom / Math.PI) * outH),
      0,
      outH - 1,
    )

    const hw = cam.width / 2
    const hh = cam.height / 2

    for (let x = xStart; x <= xEnd; x++) {
      const xx = ((x % outW) + outW) % outW
      const theta = ((xx + 0.5) / outW) * twoPi
      const sinT = Math.sin(theta)
      const cosT = Math.cos(theta)

      for (let y = yTop; y <= yBottom; y++) {
        const phi = (0.5 - (y + 0.5) / outH) * Math.PI
        const cosPhi = Math.cos(phi)
        const sinPhi = Math.sin(phi)
        const vx = cosPhi * sinT
        const vy = sinPhi
        const vz = cosPhi * cosT

        const cx = R[0] * vx + R[1] * vy + R[2] * vz
        const cy = R[3] * vx + R[4] * vy + R[5] * vz
        const cz = R[6] * vx + R[7] * vy + R[8] * vz
        if (cz <= 1e-6) continue

        const u = cam.cx + cam.f * (cx / cz)
        const v = cam.cy - cam.f * (cy / cz)
        if (u < 0 || u >= p.width || v < 0 || v >= p.height) continue

        const w =
          featherHorizontal((u - cam.cx) / hw) *
          featherHorizontal((v - cam.cy) / hh)
        if (w <= 0) continue

        const idx = y * outW + xx
        if (w <= bestW[idx]) continue
        const [r, g, b] = sampleBilinear(p.data, p.width, p.height, u, v)
        bestW[idx] = w
        bestR[idx] = r
        bestG[idx] = g
        bestB[idx] = b
      }
    }
    opts.onProgress?.(0.1 + 0.85 * ((fi + 1) / prepared.length))
  }

  // 4. mark covered pixels, then fill uncovered holes so they are not black
  const filled = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    if (bestW[i] > 0) filled[i] = 1
  }

  // horizontal hole filling (interpolate between filled neighbours)
  for (let y = 0; y < outH; y++) {
    const row = y * outW
    let x = 0
    while (x < outW) {
      if (filled[row + x]) {
        x++
        continue
      }
      let xe = x
      while (xe < outW && !filled[row + xe]) xe++
      const left = x - 1
      const right = xe
      const hasL = left >= 0 && filled[row + left] === 1
      const hasR = right < outW && filled[row + right] === 1
      if (hasL && hasR) {
        const span = right - left
        for (let k = x; k < xe; k++) {
          const t = (k - left) / span
          bestR[row + k] =
            bestR[row + left] * (1 - t) + bestR[row + right] * t
          bestG[row + k] =
            bestG[row + left] * (1 - t) + bestG[row + right] * t
          bestB[row + k] =
            bestB[row + left] * (1 - t) + bestB[row + right] * t
          filled[row + k] = 1
        }
      } else if (hasL || hasR) {
        const src = row + (hasL ? left : right)
        for (let k = x; k < xe; k++) {
          bestR[row + k] = bestR[src]
          bestG[row + k] = bestG[src]
          bestB[row + k] = bestB[src]
          filled[row + k] = 1
        }
      }
      x = xe
    }
  }

  // remaining small holes: vertical fill for short runs
  for (let x = 0; x < outW; x++) {
    let y = 0
    while (y < outH) {
      if (filled[y * outW + x]) {
        y++
        continue
      }
      let ye = y
      while (ye < outH && !filled[ye * outW + x]) ye++
      if (ye - y <= 8) {
        const up = y - 1
        const down = ye
        const hasU = up >= 0 && filled[up * outW + x] === 1
        const hasD = down < outH && filled[down * outW + x] === 1
        if (hasU && hasD) {
          const span = down - up
          for (let k = y; k < ye; k++) {
            const t = (k - up) / span
            const i = k * outW + x
            const ui = up * outW + x
            const di = down * outW + x
            bestR[i] = bestR[ui] * (1 - t) + bestR[di] * t
            bestG[i] = bestG[ui] * (1 - t) + bestG[di] * t
            bestB[i] = bestB[ui] * (1 - t) + bestB[di] * t
            filled[i] = 1
          }
        }
      }
      y = ye
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  const img = ctx.createImageData(outW, outH)
  const d = img.data
  for (let i = 0; i < N; i++) {
    const o = i * 4
    if (filled[i]) {
      d[o] = bestR[i]
      d[o + 1] = bestG[i]
      d[o + 2] = bestB[i]
    }
    d[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const blob = await canvasToBlob(canvas, mimeType, quality)
  opts.onProgress?.(1)
  return { blob, width: outW, height: outH, mimeType }
}

/**
 * Convenience: decode then stitch (used when frames are not already decoded).
 */
export async function stitchFrames(
  frames: FrameMeta[],
  opts: StitchOptions,
): Promise<StitchResult> {
  const decoded = await decodeFrames(frames, CONFIG.stitchSourceMaxWidth, (r) =>
    opts.onProgress?.(r * 0.1),
  )
  return stitchDecoded(decoded, opts)
}
