'use client'

import Link from 'next/link'
import { useState } from 'react'
import { buttonStyles } from '@/components/ui/button-styles'
import { Meter } from '@/components/ui/Meter'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useChainClock } from '@/hooks/useChainClock'
import { useLaunches } from '@/hooks/useLaunches'
import { describeError } from '@/lib/errors'
import { formatClock, formatDuration, formatPercent, formatSol, shortAddress } from '@/lib/format'
import { clockReading, launchPhase, type LaunchSummary } from '@/lib/launch'

function LaunchRow({ launch, now }: { launch: LaunchSummary; now: number }) {
  const reading = clockReading(launch, now)
  const phase = launchPhase(launch, now)
  const mint = launch.mint.toBase58()
  const clockDone = reading.elapsed >= reading.duration
  return (
    <li>
      <Link
        href={`/t/${mint}`}
        className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 px-4 py-4 transition-colors hover:bg-case/70 focus-visible:bg-case/70 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-ivory">
            {launch.token?.symbol ?? shortAddress(mint)}
            {launch.token?.name && <span className="ml-2 font-normal text-fog">{launch.token.name}</span>}
          </p>
          <p className="readout mt-0.5 text-2xs text-steel">{shortAddress(mint, 6)}</p>
        </div>

        <div className="order-last col-span-2 md:order-none md:col-span-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-steel">Clock</span>
            <span className="readout text-fog">
              {clockDone
                ? `done, ${formatDuration(reading.duration)}`
                : `${formatClock(reading.elapsed)} / ${formatClock(reading.duration)}`}
            </span>
          </div>
          <Meter
            className="mt-1.5"
            value={reading.soldFraction}
            ahead={reading.releasedFraction}
            label={`${formatPercent(reading.releasedFraction)} released, ${formatPercent(reading.soldFraction)} sold`}
          />
        </div>

        <div className="hidden md:block">
          <p className="text-xs text-steel">Sold</p>
          <p className="readout text-sm text-ivory">{formatPercent(reading.soldFraction)}</p>
        </div>

        <div className="hidden md:block">
          <p className="text-xs text-steel">Raised</p>
          <p className="readout text-sm text-ivory">
            {formatSol(launch.market.quoteReserve, 2)}
            <span className="text-steel"> / {formatSol(launch.market.migrationQuoteThreshold, 2)} SOL</span>
          </p>
        </div>

        <div className="justify-self-end">
          <StatusBadge phase={phase} />
        </div>
      </Link>
    </li>
  )
}

const COLLAPSED_COUNT = 8

export function LaunchBoard() {
  const now = useChainClock()
  const { data: launches, error, isPending, refetch } = useLaunches()
  const [expanded, setExpanded] = useState(false)

  return (
    <section id="launches" aria-labelledby="launches-heading" className="mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="launches-heading" className="font-display text-xl text-ivory sm:text-2xl">
            Paced launches
          </h2>
          <p className="mt-2 text-fog">Every launch running on the issuance clock, newest first.</p>
        </div>
        <Link href="/launch" className={buttonStyles.secondary}>
          Launch a token
        </Link>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-rule bg-case/40">
        {isPending ? (
          <ul aria-busy="true" aria-label="Loading launches" className="divide-y divide-rule">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-6 px-5 py-5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-2 flex-1" />
                <Skeleton className="h-5 w-20" />
              </li>
            ))}
          </ul>
        ) : !launches ? (
          // Only without data: a failed background refetch keeps showing the last good list.
          <div role="alert" className="flex flex-wrap items-center justify-between gap-4 px-5 py-6">
            <p className="text-fog">
              Could not load launches from the RPC. <span className="text-steel">{describeError(error)}</span>
            </p>
            <button type="button" onClick={() => refetch()} className={buttonStyles.quiet}>
              Retry
            </button>
          </div>
        ) : launches.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-ivory">No paced launches on this cluster yet.</p>
            <p className="mt-1 text-fog">Start the first one; the clock begins the moment the pool opens.</p>
            <Link href="/launch" className={`${buttonStyles.primary} mt-6`}>
              Launch a token
            </Link>
          </div>
        ) : (
          <>
            <ul id="launch-list" className="divide-y divide-rule">
              {(expanded ? launches : launches.slice(0, COLLAPSED_COUNT)).map((launch) => (
                <LaunchRow key={launch.mint.toBase58()} launch={launch} now={now} />
              ))}
            </ul>
            {launches.length > COLLAPSED_COUNT && (
              <div className="border-t border-rule px-5 py-3 text-center">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls="launch-list"
                  onClick={() => setExpanded((v) => !v)}
                  className={buttonStyles.quiet}
                >
                  {expanded ? 'Show fewer' : `Show all ${launches.length} launches`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
