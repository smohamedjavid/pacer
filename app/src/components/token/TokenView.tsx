'use client'

import { PublicKey } from '@solana/web3.js'
import Link from 'next/link'
import { useMemo, type ReactNode } from 'react'
import { buttonStyles } from '@/components/ui/button-styles'
import { Skeleton } from '@/components/ui/Skeleton'
import { useActivity } from '@/hooks/useActivity'
import { useChainClock } from '@/hooks/useChainClock'
import { useLaunch } from '@/hooks/useLaunch'
import { describeError } from '@/lib/errors'
import { LegacyLaunchError, clockReading, launchPhase, type LaunchDetail } from '@/lib/launch'
import { ActivityFeed } from './ActivityFeed'
import { GraduatePanel } from './GraduatePanel'
import { IssuanceChart } from './IssuanceChart'
import { MigratedPanel } from './MigratedPanel'
import { StatGrid } from './StatGrid'
import { TokenHeader } from './TokenHeader'
import { TradePanel } from './TradePanel'

function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading launch" className="space-y-8">
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[26rem]" />
        <Skeleton className="h-[26rem]" />
      </div>
      <Skeleton className="h-40" />
    </div>
  )
}

function Message({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="font-display text-2xl text-ivory">{title}</h1>
      <p className="mt-4 text-fog">{body}</p>
      <div className="mt-8 flex justify-center gap-3">{action}</div>
    </div>
  )
}

function Launch({ launch }: { launch: LaunchDetail }) {
  const now = useChainClock()
  const phase = launchPhase(launch, now)
  const reading = clockReading(launch, now)
  const onCurve = phase === 'live' || phase === 'clock-complete'
  const activity = useActivity(launch.mint, { live: phase !== 'graduated' })
  const symbol = launch.token?.symbol ?? 'tokens'

  return (
    <div className="space-y-8">
      <TokenHeader launch={launch} phase={phase} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <IssuanceChart launch={launch} reading={reading} activity={activity.data} now={now} live={onCurve} />
        <div className="space-y-6">
          {phase === 'graduated' ? (
            <MigratedPanel launch={launch} />
          ) : phase === 'curve-complete' ? (
            <GraduatePanel launch={launch} />
          ) : (
            <TradePanel launch={launch} now={now} symbol={symbol} />
          )}
        </div>
      </div>
      <StatGrid launch={launch} reading={reading} phase={phase} now={now} symbol={symbol} />
      <ActivityFeed
        activity={activity.data}
        startTs={launch.pace.startTs}
        now={now}
        symbol={symbol}
        tradeCount={launch.pace.buys + launch.pace.sells}
        error={activity.isError}
      />
    </div>
  )
}

export function TokenView({ mint: mintAddress }: { mint: string }) {
  const mint = useMemo(() => new PublicKey(mintAddress), [mintAddress])
  const { data: launch, error, isPending, refetch } = useLaunch(mint)

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      {isPending ? (
        <LoadingState />
      ) : error instanceof LegacyLaunchError ? (
        <Message
          title="Launch from an older Pacer version"
          body={error.message}
          action={
            <Link href="/#launches" className={buttonStyles.secondary}>
              See live launches
            </Link>
          }
        />
      ) : error ? (
        <Message
          title="Could not read this launch"
          body={describeError(error)}
          action={
            <button type="button" onClick={() => refetch()} className={buttonStyles.secondary}>
              Try again
            </button>
          }
        />
      ) : launch === null ? (
        <Message
          title="No issuance clock on this token"
          body="This mint was not launched with Pacer on this cluster. Check the address, or pick a launch from the list."
          action={
            <Link href="/#launches" className={buttonStyles.secondary}>
              See live launches
            </Link>
          }
        />
      ) : (
        <Launch launch={launch} />
      )}
    </div>
  )
}
