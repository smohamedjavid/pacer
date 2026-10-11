'use client'

import Link from 'next/link'
import { ClockDial } from '@/components/clock/ClockDial'
import { useChainClock } from '@/hooks/useChainClock'
import { useLaunches } from '@/hooks/useLaunches'
import { formatClock, formatPercent } from '@/lib/format'
import { clockReading, launchPhase } from '@/lib/launch'
import { releasedShareAt } from '@/lib/schedule'

// A sample schedule for when nothing is live: 5% at open, the rest over 90 seconds.
const SAMPLE = { opening: 0.05, duration: 90 }

function sampleSold(t: number): number {
  // Buyers trail the clock in steps, as they do on a real launch.
  const step = 6
  return releasedShareAt(SAMPLE, Math.floor(t / step) * step) * 0.94
}

/** The hero dial: the newest live launch when there is one, otherwise a sample schedule. */
export function HeroClock() {
  const now = useChainClock()
  const { data: launches } = useLaunches()
  const live = launches?.find((l) => launchPhase(l, now) === 'live')

  if (live) {
    const reading = clockReading(live, now)
    const symbol = live.token?.symbol ?? 'token'
    return (
      <figure className="flex flex-col items-center gap-5">
        <ClockDial
          className="w-full max-w-[420px]"
          released={reading.releasedFraction}
          sold={reading.soldFraction}
          readout={formatClock(reading.elapsed)}
          readoutLabel={`of ${formatClock(reading.duration)}`}
          label={`${symbol} issuance clock: ${formatPercent(reading.releasedFraction)} released, ${formatPercent(reading.soldFraction)} sold`}
        />
        <figcaption className="text-center text-sm text-fog">
          Live now:{' '}
          <Link
            href={`/t/${live.mint.toBase58()}`}
            className="font-semibold text-ivory underline decoration-gilt underline-offset-4"
          >
            {symbol}
          </Link>
          , {formatPercent(reading.releasedFraction)} released and {formatPercent(reading.soldFraction)} sold
        </figcaption>
      </figure>
    )
  }

  const t = now % (SAMPLE.duration + 10)
  const released = releasedShareAt(SAMPLE, t)
  return (
    <figure className="flex flex-col items-center gap-5">
      <ClockDial
        className="w-full max-w-[420px]"
        released={released}
        sold={sampleSold(t)}
        readout={formatClock(Math.min(t, SAMPLE.duration))}
        readoutLabel={`of ${formatClock(SAMPLE.duration)}`}
        label="Sample issuance clock: supply is released steadily and buyers follow it"
      />
      <figcaption className="text-center text-sm text-fog">
        Sample schedule: 5% at open, the rest released over 90 seconds
      </figcaption>
    </figure>
  )
}
