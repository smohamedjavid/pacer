'use client'

import { availableToBuy, buildFillCurveBuyTx, buildPacedBuyTx } from '@pacer/sdk'
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
import { clockReading, type ClockReading, type LaunchDetail } from '@/lib/launch'
import { queryKeys } from '@/lib/query-keys'
import { fillCurveBudget, quoteBuy } from '@/lib/quote'
import { BASE_DECIMALS, parseUnits, unitsToDecimalString } from '@/lib/units'

/** Keep a little SOL back for fees and the token account rent. */
const FEE_RESERVE = 10_000_000n

interface BuyCheck {
  ok: boolean
  message: string | null
}

function secondsToRelease(short: bigint, rate: bigint): number | null {
  return rate > 0n ? Number((short + rate - 1n) / rate) : null
}

/** Mirrors the hook's checks so a buy that would revert is explained before it is sent. */
function checkBuy(launch: LaunchDetail, amount: bigint | null, reading: ClockReading, symbol: string): BuyCheck {
  const { pace } = launch
  if (amount === null) return { ok: false, message: 'Enter an amount like 1000 or 2500.5.' }
  if (amount === 0n) return { ok: false, message: null }
  if (pace.maxPerBuy > 0n && amount > pace.maxPerBuy) {
    return {
      ok: false,
      message: `Each buy is capped at ${formatTokens(pace.maxPerBuy)} ${symbol}. Split it into smaller buys.`,
    }
  }
  if (amount > reading.available) {
    const wait = secondsToRelease(amount - reading.available, pace.releasePerSecond)
    return {
      ok: false,
      message:
        `The clock has released ${formatTokens(reading.available)} ${symbol} that nobody holds yet.` +
        (wait !== null ? ` Lower the amount, or wait about ${wait}s for this size.` : ' Lower the amount.'),
    }
  }
  if (reading.burst !== null && amount > reading.burst) {
    const wait = secondsToRelease(amount - reading.burst, pace.releasePerSecond)
    return {
      ok: false,
      message:
        `The burst limit allows ${formatTokens(reading.burst)} ${symbol} right now across all wallets.` +
        (wait !== null ? ` It refills in about ${wait}s for this size.` : ''),
    }
  }
  return { ok: true, message: null }
}

export function BuyForm({ launch, now, symbol }: { launch: LaunchDetail; now: number; symbol: string }) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const { data: balances } = useBalances(launch.mint)
  const tx = useTransaction()
  const [input, setInput] = useState('')

  const amount = input.trim() === '' ? 0n : parseUnits(input, BASE_DECIMALS)
  const remaining = launch.market.curveSupply > launch.pace.netOut ? launch.market.curveSupply - launch.pace.netOut : 0n
  const available = availableToBuy(launch.pace, now, launch.market.curveSupply)
  const check = checkBuy(launch, amount, clockReading(launch, now), symbol)
  // Taking the last of the curve has to be a partial-fill buy (see buildFillCurveBuyTx).
  const fillsCurve = amount !== null && amount > 0n && amount >= remaining
  const quote = amount && !fillsCurve ? quoteBuy(launch, amount, now) : null
  const spendCap = fillsCurve ? fillCurveBudget(launch) : (quote?.maxQuoteIn ?? 0n)
  const solShort =
    balances !== undefined && amount !== null && amount > 0n && balances.lamports < spendCap + FEE_RESERVE

  const message =
    check.message ??
    (solShort
      ? `This needs up to ${formatSol(spendCap + FEE_RESERVE)} SOL; the wallet holds ${formatSol(balances?.lamports ?? 0n)}.`
      : null)
  const canSubmit = publicKey !== null && check.ok && !solShort && !tx.busy && (fillsCurve || quote !== null)

  async function submit() {
    if (!publicKey || amount === null) return
    const signature = await tx.run(
      async () => {
        if (fillsCurve) {
          const transaction = await buildFillCurveBuyTx(connection, {
            owner: publicKey,
            pool: launch.pace.pool,
            maxQuoteIn: new BN(fillCurveBudget(launch).toString()),
          })
          return { transaction }
        }
        const { transaction } = await buildPacedBuyTx(connection, {
          owner: publicKey,
          pool: launch.pace.pool,
          baseAmountOut: new BN(amount.toString()),
        })
        return { transaction }
      },
      {
        successMessage: fillsCurve ? 'Bought the rest of the curve.' : `Bought ${formatTokens(amount)} ${symbol}.`,
        refresh: [
          queryKeys.launch(launch.mint),
          queryKeys.activity(launch.mint),
          queryKeys.balances(launch.mint, publicKey),
        ],
      }
    )
    if (signature) setInput('')
  }

  const maxAmount = available < remaining ? available : remaining
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
            onClick={() => setInput(unitsToDecimalString(maxAmount, BASE_DECIMALS))}
            disabled={maxAmount === 0n}
            className={buttonStyles.quiet}
          >
            Max available
          </button>
        }
        hint={
          message ?? (
            <>
              <span className="readout text-gilt">{formatTokens(available)}</span> {symbol} available right now
              {launch.pace.maxPerBuy > 0n && <>, at most {formatTokens(launch.pace.maxPerBuy)} per buy</>}.
            </>
          )
        }
      />

      <dl className="space-y-1.5 rounded-xl border border-rule bg-dial/50 px-4 py-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-fog">{fillsCurve ? 'Spends at most' : 'Estimated cost'}</dt>
          <dd className="readout text-ivory">
            {fillsCurve ? `${formatSol(spendCap)} SOL` : quote ? `${formatSol(quote.quoteIn, 6)} SOL` : '—'}
          </dd>
        </div>
        {!fillsCurve && (
          <div className="flex justify-between gap-3">
            <dt className="text-fog">Max with 1% slippage</dt>
            <dd className="readout text-fog">{quote ? `${formatSol(quote.maxQuoteIn, 6)} SOL` : '—'}</dd>
          </div>
        )}
        {fillsCurve && (
          <p className="text-xs text-fog">This buy completes the curve. Unused SOL stays in your wallet.</p>
        )}
      </dl>

      {publicKey === null ? (
        <ConnectWalletButton className="w-full">Connect a wallet to buy</ConnectWalletButton>
      ) : (
        <button type="submit" disabled={!canSubmit} className={`${buttonStyles.primary} w-full`}>
          {fillsCurve
            ? 'Buy the rest of the curve'
            : `Buy ${amount && amount > 0n ? formatTokens(amount) : ''} ${symbol}`.replace(/\s+/g, ' ')}
        </button>
      )}
      <TxStatus state={tx.state} />
    </form>
  )
}
