interface MeterProps {
  /** Filled share (0..1). */
  value: number
  /** Optional second, lighter share drawn behind `value` (e.g. released vs sold). */
  ahead?: number
  label: string
  tone?: 'gilt' | 'ivory' | 'verdigris'
  className?: string
}

const TONE = { gilt: 'bg-gilt', ivory: 'bg-ivory', verdigris: 'bg-verdigris' } as const

/** A thin horizontal gauge. */
export function Meter({ value, ahead, label, tone = 'ivory', className = '' }: MeterProps) {
  const pct = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(1, value)) * 100)}
      className={`relative h-1.5 overflow-hidden rounded-full bg-well ${className}`}
    >
      {ahead !== undefined && (
        <div className="absolute inset-y-0 left-0 rounded-full bg-gilt/30" style={{ width: pct(ahead) }} />
      )}
      <div className={`absolute inset-y-0 left-0 rounded-full ${TONE[tone]}`} style={{ width: pct(value) }} />
    </div>
  )
}
