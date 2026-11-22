import type { TargetAngle } from '../types'

export function ProgressRing({ targets }: { targets: TargetAngle[] }) {
  const total = targets.length
  const captured = targets.filter((t) => t.captured).length
  const frac = total > 0 ? captured / total : 0

  const cx = 60
  const cy = 60
  const r = 50
  const strokeW = 11
  const circ = 2 * Math.PI * r

  return (
    <svg
      viewBox="0 0 120 120"
      className="progress-ring"
      role="img"
      aria-label={`拍摄进度 ${captured}/${total}`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--card-2)"
        strokeWidth={strokeW}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--accent-2)"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${frac * circ} ${circ}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className="ring-label"
      >
        {captured}/{total}
      </text>
    </svg>
  )
}
