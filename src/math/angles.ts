export function degToRad(d: number): number {
  return (d * Math.PI) / 180
}

export function radToDeg(r: number): number {
  return (r * 180) / Math.PI
}

/** Wrap an angle to [-PI, PI]. */
export function wrapPi(a: number): number {
  const twoPi = Math.PI * 2
  let x = a % twoPi
  if (x > Math.PI) x -= twoPi
  else if (x < -Math.PI) x += twoPi
  return x
}

/** Shortest signed angular distance from a to b, in [-PI, PI]. */
export function angularDistance(a: number, b: number): number {
  return wrapPi(b - a)
}

/** Wrap an angle to [0, 2*PI). */
export function wrapTwoPi(a: number): number {
  const twoPi = Math.PI * 2
  let x = a % twoPi
  if (x < 0) x += twoPi
  return x
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
