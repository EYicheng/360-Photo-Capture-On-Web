import {
  cameraToWorld,
  mat3Multiply,
  mat3Transpose,
  mat3Vec3,
  type Mat3,
} from '../math/rotation'
import { yawPitchRollFromVectors } from '../math/orientation'
import { intrinsicsFromHfov, type CameraIntrinsics } from './projection'
import { nearestRotation } from './linalg'
import { detectAndDescribe, match } from './orb'
import type { DecodedFrame } from './stitcher'
import type { Vec3 } from '../types'

/**
 * ORB + RANSAC rotation refinement (classical CV). For each adjacent pair of
 * frames in the same pitch row, match ORB features, estimate the relative
 * camera rotation that best aligns them, and chain the rotations to correct
 * each frame's absolute orientation (fixing gyro error and absorbing the
 * dominant-plane parallax as a best-fit rotation).
 */

const FEATURE_W = 256
const ANGULAR_THRESH = (1.5 * Math.PI) / 180
const MIN_MATCHES = 8
const MIN_INLIERS = 6

type Mat3Arr = number[]

const toMat3 = (a: Mat3Arr): Mat3 => [
  a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8],
]

function sampleGray(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  u: number,
  v: number,
): number {
  const x0 = Math.floor(u)
  const y0 = Math.floor(v)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const fx = u - x0
  const fy = v - y0
  const g = (i: number) =>
    0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  const i00 = y0 * w + x0
  const i10 = y0 * w + x1
  const i01 = y1 * w + x0
  const i11 = y1 * w + x1
  return (
    (g(i00) * (1 - fx) + g(i10) * fx) * (1 - fy) +
    (g(i01) * (1 - fx) + g(i11) * fx) * fy
  )
}

function downscaleGray(
  frame: DecodedFrame,
  targetW: number,
): { gray: Float32Array; w: number; h: number } {
  const w = targetW
  const h = Math.max(2, Math.round((frame.height * targetW) / frame.width))
  const gray = new Float32Array(w * h)
  const sx = frame.width / w
  const sy = frame.height / h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      gray[y * w + x] = sampleGray(
        frame.data,
        frame.width,
        frame.height,
        (x + 0.5) * sx,
        (y + 0.5) * sy,
      )
    }
  }
  return { gray, w, h }
}

function toUnitVector(p: { x: number; y: number }, cam: CameraIntrinsics): Vec3 {
  const x = (p.x - cam.cx) / cam.f
  const y = -(p.y - cam.cy) / cam.f
  const n = Math.hypot(x, y, 1)
  return [x / n, y / n, 1 / n]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function crossCovariance(xa: Vec3[], xb: Vec3[]): Mat3Arr {
  const H = new Array(9).fill(0)
  for (let k = 0; k < xa.length; k++) {
    const a = xa[k]
    const b = xb[k]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) H[i * 3 + j] += b[i] * a[j]
    }
  }
  return H
}

function sample3(n: number): [number, number, number] {
  const i1 = Math.floor(Math.random() * n)
  let i2 = Math.floor(Math.random() * (n - 1))
  if (i2 >= i1) i2++
  let i3 = Math.floor(Math.random() * (n - 2))
  if (i3 >= Math.min(i1, i2)) i3++
  if (i3 >= Math.max(i1, i2)) i3++
  return [i1, i2, i3]
}

/** RANSAC rotation: find the rotation mapping unit vectors xa -> xb. */
function ransacRotation(xa: Vec3[], xb: Vec3[]): Mat3Arr | null {
  const n = xa.length
  if (n < 3) return null
  let bestInliers: number[] = []
  let bestR: Mat3Arr | null = null

  for (let iter = 0; iter < 250; iter++) {
    const [i1, i2, i3] = sample3(n)
    const H = crossCovariance(
      [xa[i1], xa[i2], xa[i3]],
      [xb[i1], xb[i2], xb[i3]],
    )
    const R = nearestRotation(H)
    const inliers: number[] = []
    for (let k = 0; k < n; k++) {
      const r = mat3Vec3(toMat3(R), xa[k]) as Vec3
      const c = Math.min(1, Math.max(-1, dot(r, xb[k])))
      if (Math.acos(c) < ANGULAR_THRESH) inliers.push(k)
    }
    if (inliers.length > bestInliers.length) {
      bestInliers = inliers
      bestR = R
    }
  }

  if (!bestR || bestInliers.length < MIN_INLIERS) return null
  // refit with all inliers
  const xaIn = bestInliers.map((k) => xa[k])
  const xbIn = bestInliers.map((k) => xb[k])
  return nearestRotation(crossCovariance(xaIn, xbIn))
}

function estimateRelativeRotation(
  a: DecodedFrame,
  b: DecodedFrame,
  hfovDeg: number,
): Mat3Arr | null {
  const ga = downscaleGray(a, FEATURE_W)
  const gb = downscaleGray(b, FEATURE_W)
  const fa = detectAndDescribe(ga.gray, ga.w, ga.h)
  const fb = detectAndDescribe(gb.gray, gb.w, gb.h)
  const ms = match(fa, fb)
  if (ms.length < MIN_MATCHES) return null

  const camA = intrinsicsFromHfov(ga.w, ga.h, hfovDeg)
  const camB = intrinsicsFromHfov(gb.w, gb.h, hfovDeg)
  const xa: Vec3[] = []
  const xb: Vec3[] = []
  for (const [i, j] of ms) {
    xa.push(toUnitVector(fa.points[i], camA))
    xb.push(toUnitVector(fb.points[j], camB))
  }
  return ransacRotation(xa, xb)
}

export interface RefinedOrientation {
  yaw: number
  pitch: number
  roll: number
}

/** Refine each frame's orientation by chaining pairwise ORB rotations. */
export function refineRotations(
  decoded: DecodedFrame[],
  hfovDeg: number,
  onProgress?: (ratio: number) => void,
): RefinedOrientation[] {
  const result: RefinedOrientation[] = decoded.map((d) => ({
    yaw: d.yaw,
    pitch: d.pitch,
    roll: d.roll,
  }))

  const groups = new Map<number, number[]>()
  decoded.forEach((d, i) => {
    const key = Math.round(d.pitch * 1000)
    const arr = groups.get(key)
    if (arr) arr.push(i)
    else groups.set(key, [i])
  })

  let done = 0
  let total = 0
  for (const indices of groups.values()) total += Math.max(0, indices.length - 1)

  for (const indices of groups.values()) {
    indices.sort((a, b) => decoded[a].yaw - decoded[b].yaw)
    for (let k = 1; k < indices.length; k++) {
      const iPrev = indices[k - 1]
      const iCur = indices[k]
      const Rrel = estimateRelativeRotation(
        decoded[iPrev],
        decoded[iCur],
        hfovDeg,
      )
      if (Rrel) {
        const p = result[iPrev]
        const RwA = cameraToWorld(p.yaw, p.pitch, p.roll)
        const RwB = mat3Multiply(RwA, mat3Transpose(toMat3(Rrel)))
        const f = mat3Vec3(RwB, [0, 0, 1]) as Vec3
        const u = mat3Vec3(RwB, [0, 1, 0]) as Vec3
        result[iCur] = yawPitchRollFromVectors(f, u)
      }
      done++
      onProgress?.(total > 0 ? done / total : 1)
    }
  }
  return result
}
