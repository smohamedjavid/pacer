'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { useTransaction } from '@/hooks/useTransaction'
import type { LaunchDetail } from '@/lib/launch'
import { BuyForm } from './BuyForm'
import { SellForm } from './SellForm'

const TABS = ['buy', 'sell'] as const
type Tab = (typeof TABS)[number]

export function TradePanel({ launch, now, symbol }: { launch: LaunchDetail; now: number; symbol: string }) {
  const [tab, setTab] = useState<Tab>('buy')
  const id = useId()
  // One transaction for the panel: switching tabs can't drop a pending trade or start a second.
  const tx = useTransaction()

  function select(next: Tab) {
    if (tx.busy || next === tab) return
    tx.reset()
    setTab(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    if (tx.busy) return
    const next = tab === 'buy' ? 'sell' : 'buy'
    select(next)
    document.getElementById(`${id}-tab-${next}`)?.focus()
  }

  return (
    <section aria-label="Trade" className="rounded-2xl border border-rule bg-case/50 p-4 sm:p-5">
      <div
        role="tablist"
        aria-label="Trade direction"
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 rounded-full border border-rule p-1"
      >
        {TABS.map((t) => (
          <button
            key={t}
            id={`${id}-tab-${t}`}
            role="tab"
            type="button"
            aria-selected={tab === t}
            aria-controls={`${id}-panel`}
            tabIndex={tab === t ? 0 : -1}
            disabled={tx.busy && tab !== t}
            onClick={() => select(t)}
            className={`rounded-full py-2 text-sm font-semibold transition-colors ${
              tab === t
                ? t === 'buy'
                  ? 'bg-gilt text-gilt-ink'
                  : 'bg-ivory text-dial'
                : 'text-fog hover:text-ivory disabled:cursor-not-allowed disabled:opacity-40'
            }`}
          >
            {t === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="mt-5">
        {tab === 'buy' ? (
          <BuyForm launch={launch} now={now} symbol={symbol} tx={tx} />
        ) : (
          <SellForm launch={launch} now={now} symbol={symbol} tx={tx} />
        )}
      </div>
    </section>
  )
}
