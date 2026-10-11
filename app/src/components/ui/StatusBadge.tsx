import { PHASE_LABEL, type LaunchPhase } from '@/lib/launch'

const STYLES: Record<LaunchPhase, string> = {
  live: 'border-gilt/50 text-gilt',
  'clock-complete': 'border-rule-strong text-fog',
  'curve-complete': 'border-verdigris/60 text-verdigris',
  graduated: 'border-verdigris/40 bg-verdigris/10 text-verdigris',
}

export function StatusBadge({ phase }: { phase: LaunchPhase }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[phase]}`}
    >
      {phase === 'live' && (
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-gilt opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-1.5 rounded-full bg-gilt" />
        </span>
      )}
      {PHASE_LABEL[phase]}
    </span>
  )
}
