/**
 * Lightweight ORB (FAST corners + rotated BRIEF descriptors) and brute-force
 * Hamming matching. Self-contained, pure math — classical computer vision.
 */

export interface Features {
  points: Array<{ x: number; y: number }>
  descriptors: Uint8Array[] // 32 bytes = 256 bits
}

// Bresenham circle radius 3 (16 points) for FAST
const CIRCLE: Array<[number, number]> = [
  [0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3],
  [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3],
]

// deterministic BRIEF sampling pattern (256 pairs, seeded)
const BRIEF_PATTERN: Array<[number, number, number, number]> = (() => {
  let seed = 20241122
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const pts: Array<[number, number, number, number]> = []
  for (let i = 0; i < 256; i++) {
    const x1 = (rand() * 2 - 1) * 13
    const y1 = (rand() * 2 - 1) * 13
    const x2 = (rand() * 2 - 1) * 13
    const y2 = (rand() * 2 - 1) * 13
    pts.push([x1, y1, x2, y2])
  }
  return pts
})()

function sample(gray: Float32Array, w: number, h: number, x: number, y: number): number {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || xi >= w || yi < 0 || yi >= h) return 0
  return gray[yi * w + xi]
}

/** FAST-9 corners with non-max suppression, sorted by response. */
export function fastCorners(
  gray: Float32Array,
  w: number,
  h: number,
  threshold = 16,
  maxCorners = 500,
): Array<{ x: number; y: number; score: number }> {
  const scores = new Float32Array(w * h).fill(-1)
  const corners: Array<{ x: number; y: number; score: number }> = []

  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      const c = gray[y * w + x]
      const ring: number[] = []
      for (const [ox, oy] of CIRCLE) ring.push(gray[(y + oy) * w + (x + ox)])

      let score = 0
      for (const v of ring) score += Math.abs(v - c)
      if (score < threshold * 9) continue

      // FAST-9: 9 contiguous pixels all brighter or all darker
      const bright = ring.map((v) => v > c + threshold)
      const dark = ring.map((v) => v < c - threshold)
      const has = (bits: boolean[]): boolean => {
        const n = bits.length
        for (let i = 0; i < n; i++) {
          let ok = true
          for (let k = 0; k < 9; k++) if (!bits[(i + k) % n]) { ok = false; break }
          if (ok) return true
        }
        return false
      }
      if (!has(bright) && !has(dark)) continue
      scores[y * w + x] = score
    }
  }

  // non-max suppression (3x3)
  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      const s = scores[y * w + x]
      if (s < 0) continue
      let isMax = true
      for (let dy = -1; dy <= 1 && isMax; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          if (scores[(y + dy) * w + (x + dx)] > s) {
            isMax = false
            break
          }
        }
      }
      if (isMax) corners.push({ x, y, score: s })
    }
  }

  corners.sort((a, b) => b.score - a.score)
  return corners.slice(0, maxCorners)
}

/** Intensity-centroid orientation for a corner (radians). */
function orientation(gray: Float32Array, w: number, h: number, x: number, y: number): number {
  const r = 15
  let m10 = 0
  let m01 = 0
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx
      const yy = y + dy
      if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue
      const v = gray[yy * w + xx]
      m10 += dx * v
      m01 += dy * v
    }
  }
  return Math.atan2(m01, m10)
}

/** Detect ORB features (corners + oriented BRIEF descriptors). */
export function detectAndDescribe(
  gray: Float32Array,
  w: number,
  h: number,
  maxCorners = 500,
): Features {
  const corners = fastCorners(gray, w, h, 16, maxCorners)
  const points: Array<{ x: number; y: number }> = []
  const descriptors: Uint8Array[] = []

  for (const { x, y } of corners) {
    const theta = orientation(gray, w, h, x, y)
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)
    const desc = new Uint8Array(32)
    for (let b = 0; b < 256; b++) {
      const [x1, y1, x2, y2] = BRIEF_PATTERN[b]
      const rx1 = cosT * x1 - sinT * y1
      const ry1 = sinT * x1 + cosT * y1
      const rx2 = cosT * x2 - sinT * y2
      const ry2 = sinT * x2 + cosT * y2
      const a = sample(gray, w, h, x + rx1, y + ry1)
      const bb = sample(gray, w, h, x + rx2, y + ry2)
      if (a < bb) desc[b >> 3] |= 1 << (b & 7)
    }
    points.push({ x, y })
    descriptors.push(desc)
  }
  return { points, descriptors }
}

function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i]
    while (x) {
      d += x & 1
      x >>= 1
    }
  }
  return d
}

/** Brute-force Hamming match with Lowe's ratio test. */
export function match(
  a: Features,
  b: Features,
  ratioThreshold = 0.75,
  maxDistance = 96,
): Array<[number, number]> {
  const matches: Array<[number, number]> = []
  for (let i = 0; i < a.descriptors.length; i++) {
    let best = 0
    let bestD = Infinity
    let secondD = Infinity
    for (let j = 0; j < b.descriptors.length; j++) {
      const d = hamming(a.descriptors[i], b.descriptors[j])
      if (d < bestD) {
        secondD = bestD
        bestD = d
        best = j
      } else if (d < secondD) {
        secondD = d
      }
    }
    if (bestD <= maxDistance && bestD < ratioThreshold * secondD) {
      matches.push([i, best])
    }
  }
  return matches
}
