/**
 * Horizontal feather: a cosine crossfade that goes 1 at the frame center and
 * 0 at its horizontal edges. For a roughly 50% horizontal overlap this makes
 * adjacent frames crossfade instead of being fully averaged, which greatly
 * reduces the "double image" (ghosting) when frames are slightly misaligned.
 */
export function featherHorizontal(n: number): number {
  const a = Math.abs(n)
  if (a >= 1) return 0
  return 0.5 * (1 + Math.cos(a * Math.PI))
}

/**
 * Vertical feather: flat across the center, fading only in the outer 15% on
 * each side. Vertical overlap between pitch rows is thin, so a flat center
 * avoids dark bands while still softening the top/bottom edges.
 */
export function featherVertical(n: number): number {
  const a = Math.abs(n)
  if (a >= 1) return 0
  if (a < 0.85) return 1
  return 0.5 * (1 + Math.cos(((a - 0.85) / 0.15) * Math.PI))
}
