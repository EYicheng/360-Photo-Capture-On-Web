import { describe, expect, it } from 'vitest'
import { featherHorizontal, featherVertical } from './blending'

describe('blending', () => {
  it('horizontal feather is 1 at center and 0 at edges', () => {
    expect(featherHorizontal(0)).toBeCloseTo(1)
    expect(featherHorizontal(1)).toBe(0)
    expect(featherHorizontal(-1)).toBe(0)
    expect(featherHorizontal(0.5)).toBeCloseTo(0.5)
  })

  it('vertical feather is flat across the center', () => {
    expect(featherVertical(0)).toBe(1)
    expect(featherVertical(0.5)).toBe(1)
    expect(featherVertical(0.8)).toBe(1)
  })

  it('vertical feather fades to 0 at the edges', () => {
    expect(featherVertical(1)).toBe(0)
    expect(featherVertical(-1)).toBe(0)
    const mid = featherVertical(0.92)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })
})
