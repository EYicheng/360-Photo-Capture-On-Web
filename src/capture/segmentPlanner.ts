import type { TargetAngle } from '../types'
import { degToRad } from '../math/angles'

/**
 * Build evenly spaced capture targets around the horizontal circle.
 * `count` targets, one every 360/count degrees, at a fixed pitch (0 for
 * a single-row panorama).
 */
export function buildTargets(count: number, pitchDeg = 0): TargetAngle[] {
  const stepDeg = 360 / count
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    yaw: degToRad((i * stepDeg) % 360),
    pitch: degToRad(pitchDeg),
    captured: false,
  }))
}

/**
 * Build a full-sphere capture plan: several pitch rows (given in degrees,
 * ordered by capture sequence), each with a yaw count scaled by cos(pitch)
 * so horizontal overlap stays roughly constant. Pole rows (±90°) get a
 * single shot.
 */
export function buildSphereTargets(
  pitchRowsDeg: number[],
  baseYawCount: number,
): TargetAngle[] {
  const targets: TargetAngle[] = []
  let index = 0
  for (const pitchDeg of pitchRowsDeg) {
    const pitch = degToRad(pitchDeg)
    const isPole = Math.abs(pitchDeg) >= 89
    const count = isPole
      ? 1
      : Math.max(4, Math.round(baseYawCount * Math.cos(pitch)))
    const step = (Math.PI * 2) / count
    for (let i = 0; i < count; i++) {
      targets.push({
        index: index++,
        yaw: i * step,
        pitch,
        captured: false,
      })
    }
  }
  return targets
}

/**
 * Find the not-yet-captured target whose yaw is closest to `yaw`.
 * Returns null when all targets are captured.
 */
export function nearestUncaptured(
  targets: TargetAngle[],
  yaw: number,
): TargetAngle | null {
  let best: TargetAngle | null = null
  let bestDist = Infinity
  for (const t of targets) {
    if (t.captured) continue
    const d = Math.abs(angularDistanceSafe(yaw, t.yaw))
    if (d < bestDist) {
      bestDist = d
      best = t
    }
  }
  return best
}

/** First not-yet-captured target in plan order. */
export function nextUncaptured(targets: TargetAngle[]): TargetAngle | null {
  return targets.find((t) => !t.captured) ?? null
}

/** Count of captured targets. */
export function capturedCount(targets: TargetAngle[]): number {
  return targets.reduce((n, t) => n + (t.captured ? 1 : 0), 0)
}

/** true when every target has been captured. */
export function allCaptured(targets: TargetAngle[]): boolean {
  return capturedCount(targets) === targets.length
}

function angularDistanceSafe(a: number, b: number): number {
  const twoPi = Math.PI * 2
  let x = (b - a) % twoPi
  if (x > Math.PI) x -= twoPi
  else if (x < -Math.PI) x += twoPi
  return x
}
