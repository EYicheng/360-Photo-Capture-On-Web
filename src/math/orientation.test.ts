import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../types'
import { cameraToWorld, mat3Vec3 } from './rotation'
import {
  deviceRotationMatrix,
  orientationFromMatrix,
  yawPitchRollFromVectors,
} from './orientation'

describe('orientation decomposition', () => {
  it('round-trips with cameraToWorld', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [0.7, 0.3, 0.2],
      [Math.PI / 2, 0, 0],
      [0, Math.PI / 4, 0],
      [0, 0, Math.PI / 6],
      [-1.2, -0.8, 0.5],
    ]
    for (const [yaw, pitch, roll] of cases) {
      const R = cameraToWorld(yaw, pitch, roll)
      const f = mat3Vec3(R, [0, 0, 1]) as Vec3
      const u = mat3Vec3(R, [0, 1, 0]) as Vec3
      const out = yawPitchRollFromVectors(f, u)
      expect(out.yaw).toBeCloseTo(yaw, 5)
      expect(out.pitch).toBeCloseTo(pitch, 5)
      expect(out.roll).toBeCloseTo(roll, 5)
    }
  })

  it('upright portrait phone points horizontally with no roll', () => {
    // alpha=0, beta=90 (upright), gamma=0
    const o = orientationFromMatrix(deviceRotationMatrix(0, 90, 0))
    expect(o.pitch).toBeCloseTo(0, 5)
    expect(o.roll).toBeCloseTo(0, 5)
  })

  it('flat phone (screen up) points straight down', () => {
    // alpha=0, beta=0 (flat), gamma=0
    const o = orientationFromMatrix(deviceRotationMatrix(0, 0, 0))
    expect(o.pitch).toBeCloseTo(-Math.PI / 2, 5)
  })

  it('screen-down phone points straight up', () => {
    const o = orientationFromMatrix(deviceRotationMatrix(0, 180, 0))
    expect(o.pitch).toBeCloseTo(Math.PI / 2, 5)
  })
})
