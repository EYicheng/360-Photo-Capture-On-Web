import { describe, expect, it } from 'vitest'
import { detectAndDescribe, fastCorners, match } from './orb'

function square(w: number, h: number): Float32Array {
  const g = new Float32Array(w * h).fill(20)
  for (let y = 30; y < 70; y++) {
    for (let x = 30; x < 70; x++) g[y * w + x] = 220
  }
  return g
}

function noise(w: number, h: number, seed: number): Float32Array {
  let s = seed
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const g = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) g[i] = rnd() * 255
  return g
}

describe('orb', () => {
  it('detects corners on a bright square', () => {
    const w = 96
    const h = 96
    const corners = fastCorners(square(w, h), w, h, 16, 500)
    expect(corners.length).toBeGreaterThanOrEqual(4)
  })

  it('detectAndDescribe returns matching-size descriptors', () => {
    const w = 128
    const h = 96
    const f = detectAndDescribe(noise(w, h, 1), w, h, 200)
    expect(f.points.length).toBe(f.descriptors.length)
    expect(f.points.length).toBeGreaterThan(0)
    expect(f.descriptors[0]).toHaveLength(32)
  })

  it('matches two shifted copies of the same texture', () => {
    const w = 160
    const h = 120
    const base = noise(w, h, 7)
    // shift the base by (10, 6) with wrap
    const shifted = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        shifted[y * w + x] = base[((y - 6 + h) % h) * w + ((x - 10 + w) % w)]
      }
    }
    const fa = detectAndDescribe(base, w, h, 300)
    const fb = detectAndDescribe(shifted, w, h, 300)
    const ms = match(fa, fb)
    expect(ms.length).toBeGreaterThan(5)
  })
})
