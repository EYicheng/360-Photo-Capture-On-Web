import { describe, expect, it } from 'vitest'
import { det3, eigenSymmetric3, nearestRotation } from './linalg'
import { cameraToWorld, mat3Vec3, type Mat3 } from '../math/rotation'
import type { Vec3 } from '../types'

function matmul(a: number[], b: number[]): number[] {
  const o = new Array(9).fill(0)
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
  return o
}

function approx(m: number[]): boolean {
  return m.every((v) => Number.isFinite(v) && !Number.isNaN(v))
}

describe('linalg', () => {
  it('eigendecomposes a symmetric matrix', () => {
    const M = [4, 1, 0, 1, 3, 2, 0, 2, 5]
    const { Q, d } = eigenSymmetric3(M)
    // reconstruct M = Q diag(d) Q^T
    const QT = [Q[0], Q[3], Q[6], Q[1], Q[4], Q[7], Q[2], Q[5], Q[8]]
    const Qd = [Q[0] * d[0], Q[1] * d[1], Q[2] * d[2], Q[3] * d[0], Q[4] * d[1], Q[5] * d[2], Q[6] * d[0], Q[7] * d[1], Q[8] * d[2]]
    const rec = matmul(Qd, QT)
    for (let i = 0; i < 9; i++) expect(rec[i]).toBeCloseTo(M[i], 5)
    expect(approx(d)).toBe(true)
  })

  it('nearestRotation returns a proper rotation for a rotation input', () => {
    const R = cameraToWorld(0.6, 0.3, -0.2)
    const rot = nearestRotation([...R])
    // should be close to R (already a rotation)
    for (let i = 0; i < 9; i++) expect(rot[i]).toBeCloseTo(R[i], 4)
    // and have det +1
    expect(det3(rot)).toBeCloseTo(1, 3)
  })

  it('nearestRotation projects a perturbed matrix to a rotation', () => {
    const R = cameraToWorld(0.4, -0.5, 0.7)
    // add noise
    const H = [...R].map((v, i) => v + ((i % 3) - 1) * 0.05)
    const rot = nearestRotation(H)
    expect(det3(rot)).toBeCloseTo(1, 3)
    // rotation should be within a few degrees of R
    for (let i = 0; i < 9; i++) expect(Math.abs(rot[i] - R[i])).toBeLessThan(0.15)
  })

  it('nearestRotation recovers a known rotation from unit vectors', () => {
    // random unit vectors
    const rnd = () => {
      const z = Math.random() * 2 - 1
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - z * z)
      return [r * Math.cos(a), r * Math.sin(a), z] as Vec3
    }
    const Rtrue = cameraToWorld(0.7, -0.3, 0.4) as Mat3
    const xa: Vec3[] = []
    const xb: Vec3[] = []
    for (let i = 0; i < 50; i++) {
      const a = rnd()
      xa.push(a)
      xb.push(mat3Vec3(Rtrue, a) as Vec3)
    }
    // H = sum b a^T
    const H = new Array(9).fill(0)
    for (let k = 0; k < xa.length; k++) {
      const a = xa[k]
      const b = xb[k]
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) H[i * 3 + j] += b[i] * a[j]
    }
    const R = nearestRotation(H)
    // R should map xa -> xb (i.e. R ≈ Rtrue)
    for (let i = 0; i < 9; i++) expect(R[i]).toBeCloseTo(Rtrue[i], 2)
  })
})
