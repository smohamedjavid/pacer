import type { PaceActivity } from '@pacer/sdk'
import { ExternalLink } from '@/components/ui/ExternalLink'
import { Skeleton } from '@/components/ui/Skeleton'
import { explorerTxUrl } from '@/lib/explorer'
import { formatAgo, formatClock, formatTokens, shortAddress } from '@/lib/format'

const KIND = {
  buy: { label: 'Buy', className: 'text-gilt' },
  sell: { label: 'Sell', className: 'text-verdigris' },
  rejected: { label: 'Blocked', className: 'text-signal' },
} as const

function rejectionReason(reason: string): string {
  if (/burst/i.test(reason)) return 'over the burst limit'
  if (/maximum size/i.test(reason)) return 'over the per-buy cap'
  return 'ahead of the clock'
}

export interface ActivityFeedProps {
  activity: readonly PaceActivity[] | undefined
  startTs: number
  now: number
  symbol: string
  /** Trades the clock has counted on-chain, to tell "no trades" from "history unavailable". */
  tradeCount: number
  error: boolean
}

export function ActivityFeed({ activity, startTs, now, symbol, tradeCount, error }: ActivityFeedProps) {
  const items = activity?.slice(0, 40)
  return (
    <section aria-labelledby="activity-heading" className="rounded-2xl border border-rule bg-case/50">
      <div className="flex items-baseline justify-between px-4 pt-4 sm:px-5">
        <h2 id="activity-heading" className="font-semibold text-ivory">
          Activity
        </h2>
        <p className="text-xs text-steel">From Pacer hook events</p>
      </div>
      {items === undefined ? (
        error ? (
          <p role="alert" className="px-5 py-8 text-sm text-fog">
            Trade history is unavailable from this RPC right now. Live numbers above still update.
          </p>
        ) : (
          <div className="space-y-3 px-5 py-5" aria-busy="true" aria-label="Loading activity">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <p className="px-5 py-8 text-sm text-fog">
          {tradeCount > 0
            ? `${tradeCount} trades are on record, but this RPC no longer serves their transactions.`
            : 'No trades yet. The first buy can take up to the opening tranche.'}
        </p>
      ) : (
        <ol
          className="relative mt-2 max-h-[26rem] divide-y divide-rule/70 overflow-y-auto"
          aria-live="polite"
          aria-relevant="additions"
        >
          {items.map((item, i) => {
            const at = item.kind === 'buy' ? item.ts : item.blockTime
            return (
              <li
                key={`${item.signature}-${i}`}
                className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-3 px-4 py-2.5 text-sm sm:px-5"
              >
                <span className={`font-semibold ${KIND[item.kind].className}`}>{KIND[item.kind].label}</span>
                <span className="min-w-0 truncate">
                  {item.kind === 'rejected' ? (
                    <span className="text-fog">
                      {item.attempted !== null && (
                        <span className="readout text-ivory">
                          {formatTokens(item.attempted)} {symbol}{' '}
                        </span>
                      )}
                      {rejectionReason(item.reason)}
                    </span>
                  ) : (
                    <span className="readout text-ivory">
                      {formatTokens(item.amount)} {symbol}
                    </span>
                  )}
                  {item.trader && <span className="readout ml-2 text-xs text-steel">{shortAddress(item.trader)}</span>}
                </span>
                <span className="text-right text-xs text-fog">
                  {at !== null && (
                    <span className="readout mr-3 hidden text-steel sm:inline" title="Time since the clock opened">
                      +{formatClock(at - startTs)}
                    </span>
                  )}
                  <ExternalLink href={explorerTxUrl(item.signature)}>
                    {at !== null ? formatAgo(now - at) : 'View'}
                  </ExternalLink>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
