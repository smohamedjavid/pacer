'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import type { LaunchDetail } from '@/lib/launch'
import { BuyForm } from './BuyForm'
import { SellForm } from './SellForm'

const TABS = ['buy', 'sell'] as const
type Tab = (typeof TABS)[number]

export function TradePanel({ launch, now, symbol }: { launch: LaunchDetail; now: number; symbol: string }) {
  const [tab, setTab] = useState<Tab>('buy')
  const id = useId()

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = tab === 'buy' ? 'sell' : 'buy'
    setTab(next)
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
            onClick={() => setTab(t)}
            className={`rounded-full py-2 text-sm font-semibold transition-colors ${
              tab === t ? (t === 'buy' ? 'bg-gilt text-gilt-ink' : 'bg-ivory text-dial') : 'text-fog hover:text-ivory'
            }`}
          >
            {t === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="mt-5">
        {tab === 'buy' ? (
          <BuyForm launch={launch} now={now} symbol={symbol} />
        ) : (
          <SellForm launch={launch} now={now} symbol={symbol} />
        )}
      </div>
    </section>
  )
}
