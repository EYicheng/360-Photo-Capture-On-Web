import { useEffect, useRef, type RefObject } from 'react'
import type { TargetAngle } from '../types'
import type { OrientationInternal } from '../hooks/useOrientation'
import { CONFIG } from '../config'
import { degToRad, radToDeg, angularDistance } from '../math/angles'
import { intrinsicsFromHfov, projectDirection } from '../stitch/projection'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  orientationRef: RefObject<OrientationInternal>
  target: TargetAngle | null
  fovDeg: number
  stableMsRef: RefObject<number>
  hasOrientation: boolean
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  size: number,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(size, 0)
  ctx.lineTo(-size * 0.6, -size * 0.7)
  ctx.lineTo(-size * 0.6, size * 0.7)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: OrientationInternal,
  target: TargetAngle | null,
  fovDeg: number,
  stableMs: number,
) {
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.06

  ctx.clearRect(0, 0, w, h)

  const cam = intrinsicsFromHfov(w, h, fovDeg)
  const tol = degToRad(CONFIG.alignToleranceDeg)

  if (!target) {
    // crosshair only (idle)
    drawCrosshair(ctx, cx, cy, r, '#ffffff88')
    return
  }

  const dyaw = angularDistance(o.yaw, target.yaw)
  const dpitch = target.pitch - o.pitch
  const isPole = Math.abs(target.pitch) >= degToRad(85)
  // at the poles yaw is degenerate (gimbal lock), so align on pitch only
  const aligned = isPole
    ? Math.abs(dpitch) <= tol
    : Math.abs(dyaw) <= tol && Math.abs(dpitch) <= tol

  const uv = projectDirection(target.yaw, target.pitch, o.yaw, o.pitch, o.roll, cam)

  // crosshair (green when aligned)
  drawCrosshair(
    ctx,
    cx,
    cy,
    r,
    aligned ? '#38d3a8' : '#ffffffcc',
  )

  if (uv) {
    let [u, v] = uv
    if (isPole) u = cx // vertical-only guidance: ignore noisy yaw at the pole
    const inView = u >= 0 && u < w && v >= 0 && v < h
    if (inView) {
      // target reticle
      const tr = Math.min(w, h) * 0.045
      ctx.strokeStyle = aligned ? '#38d3a8' : '#4f8cff'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(u, v, tr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = aligned ? '#38d3a866' : '#4f8cff44'
      ctx.fill()
    } else {
      // clamp to a margin and draw a direction arrow
      const m = Math.min(w, h) * 0.08
      const cxu = clampTo(u, m, w - m)
      const cyv = clampTo(v, m, h - m)
      const ang = Math.atan2(cyv - cy, cxu - cx)
      drawArrow(ctx, cxu, cyv, ang, '#ffb454', Math.min(w, h) * 0.05)
    }
  }

  // hold-to-capture ring
  if (aligned) {
    const progress = Math.min(1, stableMs / CONFIG.settleMs)
    const ringR = r * 1.7
    ctx.strokeStyle = '#38d3a8'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
    ctx.stroke()
  }

  // numeric hint
  if (!aligned) {
    const yawDeg = radToDeg(dyaw)
    const pitchDeg = radToDeg(dpitch)
    const hText = isPole
      ? ''
      : yawDeg < -0.5
        ? `← ${Math.abs(yawDeg).toFixed(0)}°`
        : yawDeg > 0.5
          ? `→ ${yawDeg.toFixed(0)}°`
          : ''
    const vText =
      pitchDeg < -0.5
        ? `↓ ${Math.abs(pitchDeg).toFixed(0)}°`
        : pitchDeg > 0.5
          ? `↑ ${pitchDeg.toFixed(0)}°`
          : ''
    ctx.fillStyle = '#ffffff'
    ctx.font = `${Math.max(16, Math.min(w, h) * 0.05)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`${hText} ${vText}`.trim(), cx, cy + r * 3.2)
  }
}

function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r * 1.4, cy)
  ctx.lineTo(cx + r * 1.4, cy)
  ctx.moveTo(cx, cy - r * 1.4)
  ctx.lineTo(cx, cy + r * 1.4)
  ctx.stroke()
}

function clampTo(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function GuidanceOverlay({
  videoRef,
  orientationRef,
  target,
  fovDeg,
  stableMsRef,
  hasOrientation,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const targetRef = useRef(target)
  const fovRef = useRef(fovDeg)
  const hasOrientRef = useRef(hasOrientation)

  useEffect(() => {
    targetRef.current = target
  }, [target])
  useEffect(() => {
    fovRef.current = fovDeg
  }, [fovDeg])
  useEffect(() => {
    hasOrientRef.current = hasOrientation
  }, [hasOrientation])

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (canvas && video && video.videoWidth > 0) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const w = video.videoWidth
          const h = video.videoHeight
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
          }
          drawOverlay(
            ctx,
            w,
            h,
            orientationRef.current,
            hasOrientRef.current ? targetRef.current : null,
            fovRef.current,
            stableMsRef.current,
          )
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [videoRef, orientationRef, stableMsRef])

  return <canvas ref={canvasRef} className="guidance-overlay" />
}
