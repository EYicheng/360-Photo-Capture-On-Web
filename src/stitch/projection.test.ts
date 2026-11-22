import { describe, expect, it } from 'vitest'
import { intrinsicsFromHfov, panoToPixel } from './projection'

describe('projection', () => {
  const cam = intrinsicsFromHfov(1000, 500, 90)

  it('computes focal length for 90deg hfov', () => {
    expect(cam.f).toBeCloseTo(500)
    expect(cam.cx).toBe(500)
    expect(cam.cy).toBe(250)
  })

  it('maps the camera forward direction to image center', () => {
    const yaw = 0.3
    const pitch = 0.2
    const p = panoToPixel(yaw, pitch, yaw, pitch, 0, cam)
    expect(p).not.toBeNull()
    expect(p![0]).toBeCloseTo(500, 5)
    expect(p![1]).toBeCloseTo(250, 5)
  })

  it('maps rightward direction to increasing u', () => {
    const yaw = 0.3
    const pitch = 0
    const right = panoToPixel(yaw + Math.PI / 6, pitch, yaw, pitch, 0, cam)
    expect(right).not.toBeNull()
    expect(right![0]).toBeGreaterThan(500)
  })

  it('maps upward direction to decreasing v', () => {
    // 0.2 rad (11.5deg) is within the vertical FOV (~26.5deg for 16:9 / 90deg hfov)
    const up = panoToPixel(0, 0.2, 0, 0, 0, cam)
    expect(up).not.toBeNull()
    expect(up![1]).toBeLessThan(250)
  })

  it('returns null for directions behind the camera', () => {
    const yaw = 0.3
    const behind = panoToPixel(yaw + Math.PI, 0, yaw, 0, 0, cam)
    expect(behind).toBeNull()
  })
})
