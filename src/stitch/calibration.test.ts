import { describe, expect, it } from 'vitest'
import {
  CALIB_DOWN_W,
  columnProfile,
  estimateHfov,
  measureShift1d,
} from './calibration'
import { degToRad } from '../math/angles'

describe('calibration', () => {
  it('computes a column profile', () => {
    const w = 16
    const h = 8
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = (i % 256)
      data[i * 4 + 1] = 0
      data[i * 4 + 2] = 0
      data[i * 4 + 3] = 255
    }
    const profile = columnProfile(data, w, h)
    expect(profile).toHaveLength(w)
    for (const v of profile) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })

  it('measureShift1d recovers a horizontal shift', () => {
    const w = 160
    const a = new Float32Array(w)
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let x = 0; x < w; x++) a[x] = rand() * 255

    const shift = 20
    const b = new Float32Array(w)
    for (let x = 0; x < w; x++) {
      b[x] = x - shift >= 0 ? a[x - shift] : 0
    }

    const res = measureShift1d(a, b, w / 2, w / 4, 50)
    expect(res).not.toBeNull()
    expect(res!.shift).toBe(shift)
  })

  it('estimateHfov computes the expected FOV', () => {
    // shift = 77px at 160px width for a 30deg rotation => ~62deg hfov
    const hfov = estimateHfov(77, degToRad(30), CALIB_DOWN_W)
    expect(hfov).toBeCloseTo(61.9, 0)
  })
})
