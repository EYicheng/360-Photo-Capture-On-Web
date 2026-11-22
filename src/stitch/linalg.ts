/**
 * Minimal 3x3 linear algebra for rotation estimation.
 * Jacobi eigendecomposition of symmetric matrices + polar-decomposition
 * nearest-rotation (Kabsch), all pure math.
 */

export type Mat3Arr = number[] // 3x3 row-major

function matmul3(a: Mat3Arr, b: Mat3Arr): Mat3Arr {
  const o = new Array(9).fill(0)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
    }
  }
  return o
}

function transpose3(a: Mat3Arr): Mat3Arr {
  return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]
}

export function det3(a: Mat3Arr): number {
  return (
    a[0] * (a[4] * a[8] - a[5] * a[7]) -
    a[1] * (a[3] * a[8] - a[5] * a[6]) +
    a[2] * (a[3] * a[7] - a[4] * a[6])
  )
}

/**
 * Eigendecompose a symmetric 3x3 matrix M = Q diag(d) Q^T using Jacobi
 * rotations. Returns eigenvalues `d` (descending) and eigenvectors in `Q`.
 */
export function eigenSymmetric3(m: Mat3Arr): { Q: Mat3Arr; d: number[] } {
  let A = m.slice()
  let Q: Mat3Arr = [1, 0, 0, 0, 1, 0, 0, 0, 1]

  for (let iter = 0; iter < 40; iter++) {
    const o01 = Math.abs(A[1])
    const o02 = Math.abs(A[2])
    const o12 = Math.abs(A[5])
    const maxOff = Math.max(o01, o02, o12)
    if (maxOff < 1e-12) break

    let p: number
    let q: number
    if (o01 === maxOff) {
      p = 0
      q = 1
    } else if (o02 === maxOff) {
      p = 0
      q = 2
    } else {
      p = 1
      q = 2
    }

    const app = A[p * 3 + p]
    const aqq = A[q * 3 + q]
    const apq = A[p * 3 + q]
    const theta = 0.5 * Math.atan2(2 * apq, aqq - app)
    const c = Math.cos(theta)
    const s = Math.sin(theta)

    // Jacobi rotation J in the (p,q) plane; A <- J^T A J, Q <- Q J
    const J: Mat3Arr = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    J[p * 3 + p] = c
    J[q * 3 + q] = c
    J[p * 3 + q] = s
    J[q * 3 + p] = -s
    const Jt = transpose3(J)
    A = matmul3(matmul3(Jt, A), J)
    Q = matmul3(Q, J)
  }

  const d = [A[0], A[4], A[8]]
  const idx = [0, 1, 2].sort((i, j) => d[j] - d[i])
  const dSorted = idx.map((i) => d[i])
  const Qsorted: Mat3Arr = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) Qsorted[r * 3 + c] = Q[r * 3 + idx[c]]
  }
  return { Q: Qsorted, d: dSorted }
}

/**
 * Nearest rotation to a 3x3 matrix via polar decomposition
 * R = H (H^T H)^(-1/2), with a reflection fix.
 */
export function nearestRotation(H: Mat3Arr): Mat3Arr {
  const HtH = matmul3(transpose3(H), H)
  const { Q, d } = eigenSymmetric3(HtH)
  // (HtH)^(-1/2) = Q diag(1/sqrt(d)) Q^T
  const Qd: Mat3Arr = []
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      Qd.push(Q[r * 3 + c] / Math.sqrt(Math.max(d[c], 1e-12)))
  const invSqrt = matmul3(Qd, transpose3(Q))

  let R = matmul3(H, invSqrt)
  if (det3(R) < 0) {
    // flip last column
    for (let r = 0; r < 3; r++) R[r * 3 + 2] = -R[r * 3 + 2]
  }
  return R
}
