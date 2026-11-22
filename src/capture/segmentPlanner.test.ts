import { describe, expect, it } from 'vitest'
import {
  allCaptured,
  buildSphereTargets,
  buildTargets,
  capturedCount,
  nearestUncaptured,
  nextUncaptured,
} from './segmentPlanner'

describe('segmentPlanner', () => {
  it('builds evenly spaced targets', () => {
    const t = buildTargets(12)
    expect(t).toHaveLength(12)
    expect(t[0].yaw).toBeCloseTo(0)
    expect(t[1].yaw).toBeCloseTo(Math.PI / 6)
    expect(t[11].yaw).toBeCloseTo((11 * Math.PI) / 6)
    expect(t.every((x) => x.captured === false)).toBe(true)
  })

  it('nearestUncaptured picks the closest target', () => {
    const t = buildTargets(12)
    expect(nearestUncaptured(t, 0.1)?.index).toBe(0)
    expect(nearestUncaptured(t, Math.PI / 6 + 0.05)?.index).toBe(1)
  })

  it('nextUncaptured returns the first in plan order', () => {
    const t = buildTargets(12)
    t[0].captured = true
    t[1].captured = true
    expect(nextUncaptured(t)?.index).toBe(2)
  })

  it('nearestUncaptured returns null when all captured', () => {
    const t = buildTargets(4).map((x) => ({ ...x, captured: true }))
    expect(nearestUncaptured(t, 0)).toBeNull()
    expect(allCaptured(t)).toBe(true)
  })

  it('counts captured targets', () => {
    const t = buildTargets(4)
    t[1].captured = true
    t[3].captured = true
    expect(capturedCount(t)).toBe(2)
    expect(allCaptured(t)).toBe(false)
  })

  it('builds a full-sphere plan with rows and poles', () => {
    const t = buildSphereTargets([0, 30, -30, 90, -90], 12)
    // rows: 12 (0°) + 10 (30°) + 10 (-30°) + 1 (90°) + 1 (-90°)
    expect(t).toHaveLength(34)
    const pitches = new Set(t.map((x) => x.pitch))
    expect(pitches.has(0)).toBe(true)
    expect(pitches.has(Math.PI / 6)).toBe(true)
    expect(pitches.has(-Math.PI / 6)).toBe(true)
    expect(pitches.has(Math.PI / 2)).toBe(true)
    expect(pitches.has(-Math.PI / 2)).toBe(true)
    // indices are unique and ordered
    expect(t.map((x) => x.index)).toEqual(t.map((_, i) => i))
  })
})
