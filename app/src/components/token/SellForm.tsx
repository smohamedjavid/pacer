'use client'

import { buildSellTx } from '@pacer/sdk'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import BN from 'bn.js'
import { useState } from 'react'
import { AmountField } from '@/components/ui/AmountField'
import { buttonStyles } from '@/components/ui/button-styles'
import { TxStatus } from '@/components/ui/TxStatus'
import { ConnectWalletButton } from '@/components/wallet/ConnectWalletButton'
import { useBalances } from '@/hooks/useBalances'
import { useTransaction } from '@/hooks/useTransaction'
import { formatSol, formatTokens } from '@/lib/format'
import type { LaunchDetail } from '@/lib/launch'
import { queryKeys } from '@/lib/query-keys'
import { quoteSell } from '@/lib/quote'
import { BASE_DECIMALS, parseUnits, unitsToDecimalString } from '@/lib/units'

export function SellForm({ launch, now, symbol }: { launch: LaunchDetail; now: number; symbol: string }) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const { data: balances } = useBalances(launch.mint)
  const tx = useTransaction()
  const [input, setInput] = useState('')

  const held = balances?.tokens ?? 0n
  const amount = input.trim() === '' ? 0n : parseUnits(input, BASE_DECIMALS)
  const quote = amount ? quoteSell(launch, amount, now) : null
  const message =
    amount === null
      ? 'Enter an amount like 1000 or 2500.5.'
      : balances !== undefined && amount > held
        ? `This wallet holds ${formatTokens(held)} ${symbol}.`
        : null
  const canSubmit = publicKey !== null && amount !== null && amount > 0n && message === null && !tx.busy

  async function submit() {
    if (!publicKey || !amount) return
    const signature = await tx.run(
      async () => ({
        transaction: await buildSellTx(connection, {
          owner: publicKey,
          pool: launch.pace.pool,
          baseAmountIn: new BN(amount.toString()),
        }),
      }),
      {
        successMessage: `Sold ${formatTokens(amount)} ${symbol}; that supply is back on the curve.`,
        refresh: [
          queryKeys.launch(launch.mint),
          queryKeys.activity(launch.mint),
          queryKeys.balances(launch.mint, publicKey),
        ],
      }
    )
    if (signature) setInput('')
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="space-y-4"
    >
      <AmountField
        label={`Amount of ${symbol}`}
        unit={symbol}
        value={input}
        onChange={(v) => {
          setInput(v)
          if (tx.state.status !== 'pending') tx.reset()
        }}
        invalid={message !== null}
        action={
          <button
            type="button"
            onClick={() => setInput(unitsToDecimalString(held, BASE_DECIMALS))}
            disabled={held === 0n}
            className={buttonStyles.quiet}
          >
            Max
          </button>
        }
        hint={
          message ?? (
            <>
              You hold <span className="readout text-ivory">{formatTokens(held)}</span> {symbol}. Selling returns supply
              to the curve and frees allowance for the next buyer.
            </>
          )
        }
      />
      <dl className="rounded-xl border border-rule bg-dial/50 px-4 py-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-fog">Estimated proceeds</dt>
          <dd className="readout text-ivory">{quote ? `${formatSol(quote.quoteOut, 6)} SOL` : '—'}</dd>
        </div>
      </dl>
      {publicKey === null ? (
        <ConnectWalletButton className="w-full">Connect a wallet to sell</ConnectWalletButton>
      ) : (
        <button type="submit" disabled={!canSubmit} className={`${buttonStyles.secondary} w-full`}>
          {`Sell ${amount && amount > 0n ? formatTokens(amount) : ''} ${symbol}`.replace(/\s+/g, ' ')}
        </button>
      )}
      <TxStatus state={tx.state} />
    </form>
  )
}
