import { useId } from 'react'
import { formatClock, formatDuration, formatPercent } from '@/lib/format'
import { releasedShareAt } from '@/lib/schedule'

const W = 480
const H = 220
const M = { top: 16, right: 16, bottom: 28, left: 40 }

export interface SchedulePreviewProps {
  /** Share released at open (0..1). */
  opening: number
  /** Clock length in seconds. */
  duration: number
}

/** The release line a launch will publish, drawn before it exists. */
export function SchedulePreview({ opening, duration }: SchedulePreviewProps) {
  const gradientId = useId()
  const innerW = W - M.left - M.right
  const innerH = H - M.top - M.bottom
  const shape = { opening, duration }
  const xMax = duration * 1.08
  const x = (t: number) => M.left + (t / xMax) * innerW
  const y = (v: number) => M.top + innerH - v * innerH
  const ramp = `M${x(0)},${y(0)} L${x(0)},${y(opening)} L${x(duration)},${y(1)} L${x(xMax)},${y(1)}`
  const area = `${ramp} L${x(xMax)},${y(0)} Z`
  const quarter = [0.25, 0.5, 0.75].map((f) => ({ f, t: f * duration, v: releasedShareAt(shape, f * duration) }))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Release schedule: ${formatPercent(opening)} at open, everything released after ${formatDuration(duration)}.`}
    >
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line
            x1={M.left}
            x2={M.left + innerW}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-rule)"
            strokeDasharray={v === 0 ? undefined : '2 4'}
          />
          <text
            x={M.left - 8}
            y={y(v)}
            textAnchor="end"
            dominantBaseline="central"
            fill="var(--color-steel)"
            fontSize="10"
            className="readout"
          >
            {v * 100}%
          </text>
        </g>
      ))}
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-gilt)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-gilt)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={ramp} fill="none" stroke="var(--color-gilt)" strokeWidth="2.25" />
      {quarter.map(({ f, t, v }) => (
        <g key={f}>
          <circle cx={x(t)} cy={y(v)} r="2.5" fill="var(--color-gilt)" />
          <text x={x(t)} y={H - 10} textAnchor="middle" fill="var(--color-steel)" fontSize="10" className="readout">
            +{formatClock(t)}
          </text>
        </g>
      ))}
      <text x={x(duration)} y={y(1) - 8} textAnchor="end" fill="var(--color-gilt)" fontSize="10" className="readout">
        100% at {formatDuration(duration)}
      </text>
    </svg>
  )
}
