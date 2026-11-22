import { describe, expect, it } from 'vitest'
import { fft1d, fft2d, phaseCorrelate } from './fft'

describe('fft', () => {
  it('round-trips a 1D signal', () => {
    const n = 8
    const data = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      data[i * 2] = Math.sin(i * 0.7) + 0.5 * Math.cos(i * 1.3)
      data[i * 2 + 1] = Math.cos(i * 0.4)
    }
    const copy = new Float32Array(data)
    fft1d(data)
    fft1d(data, true)
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBeCloseTo(copy[i], 4)
    }
  })

  it('round-trips a 2D image', () => {
    const w = 8
    const h = 8
    const re = new Float32Array(w * h)
    const im = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        re[y * w + x] = Math.sin(x * 0.8) * Math.cos(y * 0.6)
        im[y * w + x] = 0
      }
    }
    const reCopy = new Float32Array(re)
    fft2d(re, im, w, h)
    fft2d(re, im, w, h, true)
    for (let i = 0; i < re.length; i++) {
      expect(re[i]).toBeCloseTo(reCopy[i], 4)
    }
  })

  it('phase correlation recovers a circular shift', () => {
    const w = 64
    const h = 64
    const a = new Float32Array(w * h)
    // pseudo-random texture
    let seed = 12345
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < w * h; i++) a[i] = rand()

    const dx = 5
    const dy = -7
    const b = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = (x - dx + w) % w
        const sy = (y - dy + h) % h
        b[y * w + x] = a[sy * w + sx]
      }
    }

    const { dx: rdx, dy: rdy, peak } = phaseCorrelate(a, b, w, h)
    expect(rdx).toBe(dx)
    expect(rdy).toBe(dy)
    expect(peak).toBeGreaterThan(0.05)
  })
})
