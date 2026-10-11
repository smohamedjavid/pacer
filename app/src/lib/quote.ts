import { swapQuoteExactIn, swapQuoteExactOut } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'
import type { LaunchDetail } from './launch'

/** Slippage applied to buy quotes (the SDK's buy builder uses the same default). */
export const BUY_SLIPPAGE_BPS = 100

export interface BuyQuote {
  /** Expected SOL in, fees included (lamports). */
  quoteIn: bigint
  /** Most SOL the transaction may spend (lamports). */
  maxQuoteIn: bigint
}

export interface SellQuote {
  /** Expected SOL out (lamports). */
  quoteOut: bigint
}

const toBigInt = (v: BN | undefined): bigint => BigInt((v ?? new BN(0)).toString())

/** Local quote for an exact-out buy, computed from the cached pool state. Null if the curve cannot fill it. */
export function quoteBuy(launch: LaunchDetail, baseAmountOut: bigint, now: number): BuyQuote | null {
  if (baseAmountOut <= 0n) return null
  try {
    const result = swapQuoteExactOut(
      launch.virtualPool,
      launch.poolConfig,
      false,
      new BN(baseAmountOut.toString()),
      BUY_SLIPPAGE_BPS,
      false,
      new BN(now),
      false
    )
    return { quoteIn: toBigInt(result.includedFeeInputAmount), maxQuoteIn: toBigInt(result.maximumAmountIn) }
  } catch {
    return null
  }
}

/** Local quote for selling an exact amount of base tokens back to the curve. */
export function quoteSell(launch: LaunchDetail, baseAmountIn: bigint, now: number): SellQuote | null {
  if (baseAmountIn <= 0n) return null
  try {
    const result = swapQuoteExactIn(
      launch.virtualPool,
      launch.poolConfig,
      true,
      new BN(baseAmountIn.toString()),
      0,
      false,
      new BN(now),
      false
    )
    return { quoteOut: toBigInt(result.outputAmount) }
  } catch {
    return null
  }
}

/** SOL needed to finish the curve, with headroom for fees. Unused SOL stays in the buyer's wallet. */
export function fillCurveBudget(launch: LaunchDetail): bigint {
  const { migrationQuoteThreshold, quoteReserve } = launch.market
  const missing = migrationQuoteThreshold > quoteReserve ? migrationQuoteThreshold - quoteReserve : 0n
  return (missing * 106n) / 100n + 10_000n
}
