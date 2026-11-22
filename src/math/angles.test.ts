import { describe, expect, it } from 'vitest'
import {
  angularDistance,
  clamp,
  degToRad,
  radToDeg,
  wrapPi,
  wrapTwoPi,
} from './angles'

describe('angles', () => {
  it('converts degrees/radians', () => {
    expect(radToDeg(degToRad(90))).toBeCloseTo(90)
    expect(degToRad(180)).toBeCloseTo(Math.PI)
  })

  it('wraps to [-PI, PI]', () => {
    expect(wrapPi(0)).toBeCloseTo(0)
    expect(wrapPi(Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapPi(-Math.PI)).toBeCloseTo(-Math.PI)
    expect(wrapPi(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapPi(-3 * Math.PI)).toBeCloseTo(-Math.PI)
  })

  it('wraps to [0, 2PI)', () => {
    expect(wrapTwoPi(0)).toBeCloseTo(0)
    expect(wrapTwoPi(-0.5)).toBeCloseTo(Math.PI * 2 - 0.5)
    expect(wrapTwoPi(Math.PI * 2 + 0.5)).toBeCloseTo(0.5)
  })

  it('computes shortest angular distance', () => {
    expect(angularDistance(0, 0.1)).toBeCloseTo(0.1)
    expect(angularDistance(0.1, 0)).toBeCloseTo(-0.1)
    // crossing the seam
    expect(angularDistance(6.2, 0.1)).toBeCloseTo(0.1 + Math.PI * 2 - 6.2)
  })

  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })
})
