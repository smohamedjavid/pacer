import { priceCeilingAt } from '@pacer/sdk'
import type { ReactNode } from 'react'
import { Meter } from '@/components/ui/Meter'
import { formatClock, formatPercent, formatSol, formatTimeOfDay, formatTokens, formatTokensCompact } from '@/lib/format'
import type { ClockReading, LaunchDetail, LaunchPhase } from '@/lib/launch'
import { formatPrice, spotPrice } from '@/lib/price'
import { ratio } from '@/lib/units'

interface StatProps {
  label: string
  children: ReactNode
  note?: ReactNode
  accent?: boolean
  gauge?: ReactNode
}

function Stat({ label, children, note, accent = false, gauge }: StatProps) {
  return (
    <div className="bg-dial/70 px-4 py-4 sm:px-5">
      <dt className="text-xs text-steel">{label}</dt>
      <dd className={`readout mt-1.5 text-lg leading-tight sm:text-xl ${accent ? 'text-gilt' : 'text-ivory'}`}>
        {children}
      </dd>
      {gauge && <dd className="mt-2.5">{gauge}</dd>}
      {note && <dd className="mt-1.5 text-xs leading-relaxed text-fog">{note}</dd>}
    </div>
  )
}

/** Unit words inside a mono readout stay in the text face. */
function Unit({ children }: { children: ReactNode }) {
  return <span className="font-sans text-sm tracking-normal text-steel">{children}</span>
}

export interface StatGridProps {
  launch: LaunchDetail
  reading: ClockReading
  phase: LaunchPhase
  now: number
  symbol: string
}

export function StatGrid({ launch, reading, phase, now, symbol }: StatGridProps) {
  const { pace, market } = launch
  const clockRunning = now < reading.endsAt
  const onCurve = phase === 'live' || phase === 'clock-complete'
  const price = spotPrice(launch.virtualPool)
  const ceiling = priceCeilingAt(pace, launch.poolConfig, now, market.curveSupply)

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-3 lg:grid-cols-5">
      <Stat label="Released by the clock" note={`${formatPercent(reading.releasedFraction)} of curve supply`}>
        {formatTokens(reading.released)}
      </Stat>
      <Stat label="Net sold" note={`${formatPercent(reading.soldFraction)} of curve supply`}>
        {formatTokens(reading.netOut)}
      </Stat>
      <Stat
        label="Buyable right now"
        accent={onCurve}
        note={
          !onCurve
            ? 'The curve is closed'
            : reading.burstLimited
              ? 'Held back by the burst limit'
              : `Released ${symbol} that nobody holds yet`
        }
      >
        {onCurve ? formatTokens(reading.buyable) : '—'}
      </Stat>
      <Stat
        label={onCurve ? 'Max price right now' : 'Final curve price'}
        accent={onCurve}
        note={
          onCurve ? (
            <>
              Curve price <span className="readout text-ivory">{formatPrice(price)}</span> SOL
            </>
          ) : (
            'Price when the curve closed'
          )
        }
      >
        {formatPrice(onCurve ? ceiling : price)} <Unit>SOL</Unit>
      </Stat>
      <Stat
        label={clockRunning ? 'Full release in' : 'Clock finished at'}
        note={
          clockRunning
            ? `+${formatTokens(pace.releasePerSecond)} ${symbol} every second, done at ${formatTimeOfDay(reading.endsAt)}`
            : `Everything released after ${formatClock(reading.duration)}`
        }
      >
        {clockRunning ? formatClock(reading.endsAt - now) : formatTimeOfDay(reading.endsAt)}
      </Stat>

      <Stat
        label="Burst bucket"
        note={
          reading.burst === null
            ? 'No burst limit on this launch'
            : `of ${formatTokensCompact(pace.burstCapacity)} capacity. Refills at the release rate and caps buying in any short window.`
        }
        gauge={
          reading.burst !== null && pace.burstCapacity > 0n ? (
            <Meter value={ratio(reading.burst, pace.burstCapacity)} tone="gilt" label="Burst bucket level" />
          ) : undefined
        }
      >
        {reading.burst === null ? 'Off' : formatTokens(reading.burst)}
      </Stat>
      <Stat
        label="Max per buy"
        note={
          pace.maxPerBuy > 0n
            ? `${formatPercent(ratio(pace.maxPerBuy, market.curveSupply))} of curve supply`
            : 'No per-buy cap'
        }
      >
        {pace.maxPerBuy > 0n ? formatTokens(pace.maxPerBuy) : 'Unlimited'}
      </Stat>
      <Stat label="Trades" note={`${formatTokens(pace.totalBought)} bought, ${formatTokens(pace.totalSold)} sold back`}>
        {pace.buys} <Unit>buys</Unit> {pace.sells} <Unit>sells</Unit>
      </Stat>
      <Stat
        label="Raised toward graduation"
        gauge={
          <Meter
            value={reading.raisedFraction}
            tone="verdigris"
            label={`${formatPercent(reading.raisedFraction)} of the graduation threshold raised`}
          />
        }
      >
        {formatSol(market.quoteReserve, 3)} <Unit>/ {formatSol(market.migrationQuoteThreshold, 2)} SOL</Unit>
      </Stat>
      <Stat
        label="Transfer hook"
        note={launch.hookActive ? 'Every buy is checked against the clock' : 'Revoked by DBC when the curve completed'}
      >
        <span className={launch.hookActive ? 'text-gilt' : 'text-verdigris'}>
          {launch.hookActive ? 'Active' : 'Revoked'}
        </span>
      </Stat>
    </dl>
  )
}
