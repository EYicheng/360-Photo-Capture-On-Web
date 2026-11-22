import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../types'
import {
  cameraToWorld,
  mat3Vec3,
  panoToVector,
  worldToCamera,
} from './rotation'

function approx(a: Vec3, b: Vec3): void {
  expect(a[0]).toBeCloseTo(b[0], 5)
  expect(a[1]).toBeCloseTo(b[1], 5)
  expect(a[2]).toBeCloseTo(b[2], 5)
}

describe('rotation', () => {
  it('forward at identity is +Z', () => {
    approx(mat3Vec3(cameraToWorld(0, 0, 0), [0, 0, 1]), [0, 0, 1])
  })

  it('yaw maps forward to longitude', () => {
    approx(
      mat3Vec3(cameraToWorld(Math.PI / 2, 0, 0), [0, 0, 1]),
      [1, 0, 0],
    )
    approx(mat3Vec3(cameraToWorld(Math.PI, 0, 0), [0, 0, 1]), [0, 0, -1])
  })

  it('pitch maps forward to latitude (+ = up)', () => {
    const f = mat3Vec3(cameraToWorld(0, Math.PI / 6, 0), [0, 0, 1])
    expect(f[1]).toBeCloseTo(0.5, 5)
    expect(Math.hypot(f[0], f[1], f[2])).toBeCloseTo(1, 5)
  })

  it('pano vector matches forward direction', () => {
    const theta = 1.1
    const phi = 0.4
    approx(mat3Vec3(cameraToWorld(theta, phi, 0), [0, 0, 1]), panoToVector(theta, phi))
  })

  it('worldToCamera inverts cameraToWorld', () => {
    const yaw = 0.7
    const pitch = 0.3
    const roll = 0.2
    const v: Vec3 = [0.4, -0.6, 0.8]
    const world = mat3Vec3(cameraToWorld(yaw, pitch, roll), v)
    const back = mat3Vec3(worldToCamera(yaw, pitch, roll), world)
    approx(back, v)
  })
})
