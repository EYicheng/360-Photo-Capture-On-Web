import { degToRad } from '../math/angles'

/**
 * Lightweight FOV calibration: measures the horizontal scene shift between
 * two frames (using a 1D column-profile correlation) and, together with the
 * known yaw difference, estimates the camera's horizontal field of view.
 * Non-AI, pure signal processing.
 */

/** Downscale an RGBA frame and reduce it to a 1D column-average profile. */
export function columnProfile(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Float32Array {
  const profile = new Float32Array(w)
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }
    profile[x] = sum / h
  }
  return profile
}

function sadAt(
  a: Float32Array,
  b: Float32Array,
  center: number,
  half: number,
  shift: number,
): number {
  const w = a.length
  let sad = 0
  let n = 0
  for (let x = center - half; x <= center + half; x++) {
    const xb = x + shift
    if (xb < 0 || xb >= w) {
      sad += 255
    } else {
      sad += Math.abs(a[x] - b[xb])
    }
    n++
  }
  return sad / n
}

/**
 * Estimate the horizontal shift between two 1D profiles by template matching
 * (minimum SAD), with a sharpness check. Returns null when ambiguous.
 */
export function measureShift1d(
  profileA: Float32Array,
  profileB: Float32Array,
  templateCenter: number,
  templateHalf: number,
  maxShift: number,
): { shift: number; score: number } | null {
  let bestShift = 0
  let bestSad = Infinity
  for (let s = -maxShift; s <= maxShift; s++) {
    const sad = sadAt(profileA, profileB, templateCenter, templateHalf, s)
    if (sad < bestSad) {
      bestSad = sad
      bestShift = s
    }
  }
  // peak must be sharp (SAD clearly worse 8px away)
  const probeA = sadAt(profileA, profileB, templateCenter, templateHalf, bestShift - 8)
  const probeB = sadAt(profileA, profileB, templateCenter, templateHalf, bestShift + 8)
  if (Math.min(probeA, probeB) < bestSad * 1.25) return null
  return { shift: bestShift, score: bestSad }
}

/**
 * Estimate horizontal FOV (degrees) from a measured horizontal shift and the
 * yaw difference between the two frames (using the exact tan relationship).
 */
export function estimateHfov(
  shiftPx: number,
  deltaYawRad: number,
  downWidth: number,
): number {
  if (shiftPx <= 0.5) return Number.NaN
  const f = shiftPx / Math.tan(deltaYawRad)
  return (2 * Math.atan(downWidth / 2 / f) * 180) / Math.PI
}

export const CALIB_DOWN_W = 160
export const CALIB_DOWN_H = 90
export const CALIB_DELTA_YAW_RAD = degToRad(30)
