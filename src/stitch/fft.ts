/**
 * Minimal radix-2 FFT + phase correlation, used for pairwise frame alignment.
 * Pure math, no dependencies — this is classical signal processing, not AI.
 */

export function nextPowerOf2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

/** In-place radix-2 FFT on interleaved complex data [re0, im0, re1, im1, ...]. */
export function fft1d(data: Float32Array, inverse = false): void {
  const n = data.length >> 1
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error('fft1d requires a power-of-two length')
  }

  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const a = i * 2
      const b = j * 2
      let t = data[a]
      data[a] = data[b]
      data[b] = t
      t = data[a + 1]
      data[a + 1] = data[b + 1]
      data[b + 1] = t
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < half; k++) {
        const a = (i + k) * 2
        const b = (i + k + half) * 2
        const tRe = data[b] * curRe - data[b + 1] * curIm
        const tIm = data[b] * curIm + data[b + 1] * curRe
        data[b] = data[a] - tRe
        data[b + 1] = data[a + 1] - tIm
        data[a] += tRe
        data[a + 1] += tIm
        const nwRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nwRe
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < data.length; i++) data[i] /= n
  }
}

/** 2D FFT via separable 1D transforms (rows then columns). */
export function fft2d(
  re: Float32Array,
  im: Float32Array,
  w: number,
  h: number,
  inverse = false,
): void {
  const row = new Float32Array(w * 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      row[x * 2] = re[y * w + x]
      row[x * 2 + 1] = im[y * w + x]
    }
    fft1d(row, inverse)
    for (let x = 0; x < w; x++) {
      re[y * w + x] = row[x * 2]
      im[y * w + x] = row[x * 2 + 1]
    }
  }
  const col = new Float32Array(h * 2)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      col[y * 2] = re[y * w + x]
      col[y * 2 + 1] = im[y * w + x]
    }
    fft1d(col, inverse)
    for (let y = 0; y < h; y++) {
      re[y * w + x] = col[y * 2]
      im[y * w + x] = col[y * 2 + 1]
    }
  }
}

function hannValue(i: number, n: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
}

/**
 * Estimate the (circular) translation between two grayscale images of the
 * same power-of-two size using normalized phase correlation.
 */
export function phaseCorrelate(
  a: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
): { dx: number; dy: number; peak: number } {
  const n = w * h
  const reA = new Float32Array(n)
  const imA = new Float32Array(n)
  const reB = new Float32Array(n)
  const imB = new Float32Array(n)

  for (let y = 0; y < h; y++) {
    const wy = hannValue(y, h)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const win = wy * hannValue(x, w)
      reA[i] = a[i] * win
      reB[i] = b[i] * win
    }
  }

  fft2d(reA, imA, w, h)
  fft2d(reB, imB, w, h)

  // cross-power spectrum: R = conj(A) * B / |conj(A) * B|
  // (this convention returns the shift of B relative to A with the correct sign)
  const reR = new Float32Array(n)
  const imR = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const ar = reA[i]
    const ai = -imA[i] // conj(A)
    const br = reB[i]
    const bi = imB[i]
    const cr = ar * br - ai * bi
    const ci = ar * bi + ai * br
    const mag = Math.hypot(cr, ci) + 1e-9
    reR[i] = cr / mag
    imR[i] = ci / mag
  }

  // suppress the DC/low-frequency component to avoid a spurious peak at 0
  for (let i = 0; i < n; i++) {
    const x = i % w
    const y = (i / w) | 0
    const fx = Math.min(x, w - x)
    const fy = Math.min(y, h - y)
    if (fx <= 1 && fy <= 1) {
      reR[i] = 0
      imR[i] = 0
    }
  }

  fft2d(reR, imR, w, h, true)

  // find the peak of the correlation surface
  let bestIdx = 0
  let bestVal = -Infinity
  for (let i = 0; i < n; i++) {
    const v = reR[i]
    if (v > bestVal) {
      bestVal = v
      bestIdx = i
    }
  }

  let dx = bestIdx % w
  let dy = (bestIdx / w) | 0
  if (dx > w / 2) dx -= w
  if (dy > h / 2) dy -= h

  return { dx, dy, peak: bestVal }
}
