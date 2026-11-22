import type { Vec3 } from '../types'
import { clamp, degToRad } from './angles'
import { mat3Multiply, rotX, rotY, rotZ, type Mat3 } from './rotation'

/**
 * Device orientation (W3C, intrinsic Z-X'-Y'') -> ENU rotation matrix
 * (X = east, Y = north, Z = up). Maps device coordinates to world coordinates.
 *
 * R = Rz(alpha) · Rx(beta) · Ry(gamma)
 */
export function deviceRotationMatrix(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
): Mat3 {
  const a = degToRad(alphaDeg)
  const b = degToRad(betaDeg)
  const g = degToRad(gammaDeg)
  return mat3Multiply(mat3Multiply(rotZ(a), rotX(b)), rotY(g))
}

function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2])
  if (n < 1e-9) return [0, 0, 1]
  return [v[0] / n, v[1] / n, v[2] / n]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Decompose a camera orientation from its forward and up vectors into
 * (yaw = longitude, pitch = latitude, roll = rotation about optical axis),
 * using the same convention as `cameraToWorld` in math/rotation.ts.
 */
export function yawPitchRollFromVectors(
  f: Vec3,
  u: Vec3,
): { yaw: number; pitch: number; roll: number } {
  const fn = normalize(f)
  const yaw = Math.atan2(fn[0], fn[2])
  const pitch = Math.asin(clamp(fn[1], -1, 1))

  const sinP = Math.sin(pitch)
  const cosP = Math.cos(pitch)
  const sinY = Math.sin(yaw)
  const cosY = Math.cos(yaw)
  // reference "up" for roll = 0 at this (yaw, pitch)
  const uRef: Vec3 = [-sinP * sinY, cosP, -sinP * cosY]

  // project u onto the plane perpendicular to fn
  const d = dot(u, fn)
  const upProj: Vec3 = [u[0] - d * fn[0], u[1] - d * fn[1], u[2] - d * fn[2]]
  const upN = normalize(upProj)

  const c = cross(uRef, upN)
  const sinR = dot(c, fn)
  const cosR = dot(uRef, upN)
  const roll = Math.atan2(sinR, cosR)

  return { yaw, pitch, roll }
}

/**
 * Extract the camera orientation (yaw/pitch/roll) from a device rotation
 * matrix, assuming a rear camera (optical axis = device -Z, up = device +Y).
 */
export function orientationFromMatrix(R: Mat3): {
  yaw: number
  pitch: number
  roll: number
} {
  // camera forward (device -Z) and camera up (device +Y) in ENU
  const fENU: Vec3 = [-R[2], -R[5], -R[8]]
  const uENU: Vec3 = [R[1], R[4], R[7]]
  // ENU -> camera world frame: swap Y (north) and Z (up)
  const f: Vec3 = [fENU[0], fENU[2], fENU[1]]
  const u: Vec3 = [uENU[0], uENU[2], uENU[1]]
  return yawPitchRollFromVectors(f, u)
}
