/** The Pacer mark: a dial with a gilt hand stopped at the opening tranche. */
export function PacerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="16"
          y1="3.5"
          x2="16"
          y2={i % 3 === 0 ? 7 : 5.5}
          stroke="currentColor"
          strokeWidth={i % 3 === 0 ? 1.6 : 1}
          transform={`rotate(${i * 30} 16 16)`}
        />
      ))}
      <path
        d="M16 16 L16 5"
        stroke="var(--color-gilt)"
        strokeWidth="2"
        strokeLinecap="round"
        transform="rotate(48 16 16)"
      />
      <circle cx="16" cy="16" r="2" fill="var(--color-gilt)" />
    </svg>
  )
}
