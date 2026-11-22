import type { Vec3 } from '../types'

/** Row-major 3x3 matrix as a flat 9-element tuple. */
export type Mat3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ]
}

export function mat3Vec3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

export function mat3Transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]
}

export function rotY(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, 0, s, 0, 1, 0, -s, 0, c]
}

export function rotX(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [1, 0, 0, 0, c, -s, 0, s, c]
}

export function rotZ(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

/**
 * Camera-to-world rotation.
 * world = rotY(yaw) · rotX(-pitch) · rotZ(roll) · camera
 *
 * With roll = 0 the camera optical axis (+Z) maps to the panorama direction
 * (longitude = yaw, latitude = pitch), so yaw/pitch equal longitude/latitude.
 */
export function cameraToWorld(yaw: number, pitch: number, roll: number): Mat3 {
  return mat3Multiply(mat3Multiply(rotY(yaw), rotX(-pitch)), rotZ(roll))
}

/**
 * World-to-camera rotation (inverse of cameraToWorld).
 * camera = rotZ(-roll) · rotX(pitch) · rotY(-yaw) · world
 */
export function worldToCamera(yaw: number, pitch: number, roll: number): Mat3 {
  return mat3Multiply(mat3Multiply(rotZ(-roll), rotX(pitch)), rotY(-yaw))
}

/** Panorama direction (longitude theta, latitude phi) -> unit vector. */
export function panoToVector(theta: number, phi: number): Vec3 {
  const cphi = Math.cos(phi)
  return [cphi * Math.sin(theta), Math.sin(phi), cphi * Math.cos(theta)]
}
