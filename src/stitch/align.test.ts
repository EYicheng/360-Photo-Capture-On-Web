import { describe, expect, it } from 'vitest'
import { refineRotations } from './align'
import type { DecodedFrame } from './stitcher'
import { cameraToWorld, mat3Vec3 } from '../math/rotation'
import { intrinsicsFromHfov } from './projection'
import { degToRad } from '../math/angles'

// Random-colored angular grid -> many sharp corners with unique patterns.
function hash2(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

const CELL = 0.12
function worldVal(theta: number, phi: number): number {
  const i = Math.floor((theta + Math.PI) / CELL)
  const j = Math.floor((phi + Math.PI / 2) / CELL)
  return Math.round(hash2(i, j) * 255)
}

function renderData(yaw: number, hfovDeg: number, w: number, h: number): Uint8ClampedArray {
  const cam = intrinsicsFromHfov(w, h, hfovDeg)
  const R = cameraToWorld(yaw, 0, 0)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5 - cam.cx) / cam.f
      const py = -(y + 0.5 - cam.cy) / cam.f
      const [wx, wy, wz] = mat3Vec3(R, [px, py, 1])
      const n = Math.hypot(wx, wy, wz)
      const theta = Math.atan2(wx, wz)
      const phi = Math.asin(Math.max(-1, Math.min(1, wy / n)))
      const val = Math.round(worldVal(theta, phi))
      const i = (y * w + x) * 4
      data[i] = val
      data[i + 1] = val
      data[i + 2] = val
      data[i + 3] = 255
    }
  }
  return data
}

describe('align (ORB rotation refinement)', () => {
  it('recovers the true relative rotation despite a snapped-yaw error', () => {
    const hfov = 60
    const w = 320
    const h = 240
    const a: DecodedFrame = {
      yaw: 0,
      pitch: 0,
      roll: 0,
      data: renderData(0, hfov, w, h),
      width: w,
      height: h,
    }
    const b: DecodedFrame = {
      yaw: degToRad(30),
      pitch: 0,
      roll: 0,
      data: renderData(degToRad(32), hfov, w, h),
      width: w,
      height: h,
    }

    const refined = refineRotations([a, b], hfov)
    const err = Math.abs(refined[1].yaw - degToRad(32))
    expect(err).toBeLessThan(degToRad(2))
  })
})
