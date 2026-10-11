const SIZE = 400
const C = SIZE / 2
const R_TICKS = 186
const R_RELEASED = 162
const R_SOLD = 146
const R_NUMERALS = 122

function polar(radius: number, fraction: number): [number, number] {
  const angle = fraction * 2 * Math.PI - Math.PI / 2
  // Rounded so server and client render identical markup.
  const round = (v: number) => Math.round(v * 100) / 100
  return [round(C + radius * Math.cos(angle)), round(C + radius * Math.sin(angle))]
}

/** SVG arc from 12 o'clock clockwise, covering `from`..`to` of a full turn. */
function arc(radius: number, from: number, to: number): string {
  const a = Math.max(0, Math.min(1, from))
  const b = Math.max(a, Math.min(0.99999, to))
  if (b - a <= 0.0001) return ''
  const [x1, y1] = polar(radius, a)
  const [x2, y2] = polar(radius, b)
  const large = b - a > 0.5 ? 1 : 0
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`
}

export interface ClockDialProps {
  /** Share of curve supply the clock has released (0..1). One full turn = everything released. */
  released: number
  /** Share of curve supply sold (0..1). */
  sold: number
  /** Large center readout, e.g. "04:12". */
  readout: string
  /** Small line under the readout. */
  readoutLabel: string
  /** Accessible summary of what the dial shows. */
  label: string
  className?: string
}

/**
 * The issuance clock as a chronograph dial. The gilt hand is the release schedule; the ivory
 * track inside it is supply already sold; the gap between them is what can be bought now.
 */
export function ClockDial({ released, sold, readout, readoutLabel, label, className }: ClockDialProps) {
  const handAngle = Math.max(0, Math.min(1, released)) * 360
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} role="img" aria-label={label}>
      <defs>
        <radialGradient id="dial-face" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#163452" />
          <stop offset="100%" stopColor="#0a1a2c" />
        </radialGradient>
      </defs>

      <circle cx={C} cy={C} r={198} fill="url(#dial-face)" stroke="var(--color-rule-strong)" strokeWidth="1.5" />
      <circle cx={C} cy={C} r={R_TICKS - 14} fill="none" stroke="var(--color-rule)" strokeWidth="1" />

      {Array.from({ length: 100 }, (_, i) => {
        const major = i % 25 === 0
        const mid = i % 5 === 0
        const [x1, y1] = polar(R_TICKS, i / 100)
        const [x2, y2] = polar(R_TICKS - (major ? 14 : mid ? 9 : 5), i / 100)
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={major || mid ? 'var(--color-ivory)' : 'var(--color-steel)'}
            strokeWidth={major ? 2.2 : mid ? 1.4 : 0.8}
            opacity={major ? 0.95 : mid ? 0.7 : 0.45}
          />
        )
      })}

      {[0, 25, 50, 75].map((pct) => {
        const [x, y] = polar(R_NUMERALS, pct / 100)
        return (
          <text
            key={pct}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--color-fog)"
            style={{ font: '400 11px var(--font-display)', letterSpacing: '0.08em' }}
          >
            {pct}
          </text>
        )
      })}

      {/* Release track: future dashed, released in gilt. */}
      <circle
        cx={C}
        cy={C}
        r={R_RELEASED}
        fill="none"
        stroke="var(--color-rule-strong)"
        strokeWidth="1.5"
        strokeDasharray="2 5"
      />
      <path d={arc(R_RELEASED, 0, released)} fill="none" stroke="var(--color-gilt)" strokeWidth="3" />

      {/* Sold track with the buyable gap shaded. */}
      <circle cx={C} cy={C} r={R_SOLD} fill="none" stroke="var(--color-well)" strokeWidth="12" />
      <path d={arc(R_SOLD, sold, released)} fill="none" stroke="var(--color-gilt-soft)" strokeWidth="12" />
      <path d={arc(R_SOLD, 0, sold)} fill="none" stroke="var(--color-ivory)" strokeWidth="12" opacity="0.92" />

      <text
        x={C}
        y={C + 58}
        textAnchor="middle"
        fill="var(--color-ivory)"
        style={{ font: '400 30px var(--font-mono)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
      >
        {readout}
      </text>
      <text
        x={C}
        y={C + 82}
        textAnchor="middle"
        fill="var(--color-fog)"
        style={{ font: '500 12px var(--font-sans)', letterSpacing: '0.02em' }}
      >
        {readoutLabel}
      </text>

      {/* The hand. Rotation eases over one second so it sweeps instead of ticking. */}
      <g
        style={{
          transform: `rotate(${handAngle}deg)`,
          transformOrigin: `${C}px ${C}px`,
          transition: 'transform 1s linear',
        }}
      >
        <line
          x1={C}
          y1={C + 26}
          x2={C}
          y2={C - R_RELEASED - 8}
          stroke="var(--color-gilt)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle
          cx={C}
          cy={C - R_RELEASED}
          r="4.5"
          fill="var(--color-dial)"
          stroke="var(--color-gilt)"
          strokeWidth="2"
        />
      </g>
      <circle cx={C} cy={C} r="7" fill="var(--color-gilt)" />
      <circle cx={C} cy={C} r="2.5" fill="var(--color-dial)" />
    </svg>
  )
}
