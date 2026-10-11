import { priceAtNetOut } from '@pacer/sdk'
import { getPriceFromSqrtPrice, type PoolConfig, type VirtualPool } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'
import { BASE_DECIMALS, QUOTE_DECIMALS } from './units'

/**
 * Curve price (SOL per token) as a function of net supply sold, memoized per config.
 * The curve is deterministic, so this also prices any point in a launch's history.
 */
export function curvePricer(config: PoolConfig): (netOut: bigint) => number {
  const cache = new Map<bigint, number>()
  return (netOut) => {
    let price = cache.get(netOut)
    if (price === undefined) {
      price = priceAtNetOut(config, new BN(netOut.toString()), BASE_DECIMALS, QUOTE_DECIMALS)
      cache.set(netOut, price)
    }
    return price
  }
}

/** Live curve price (SOL per token) from the pool's current sqrt price. */
export function spotPrice(pool: Pick<VirtualPool, 'poolState'>): number {
  return getPriceFromSqrtPrice(pool.poolState.sqrtPrice, BASE_DECIMALS, QUOTE_DECIMALS).toNumber()
}

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉'

/**
 * Small prices in the subscript-zero style traders read on DEX screens:
 * 0.000000001234 → "0.0₈1234". Larger prices print normally.
 */
export function formatPrice(price: number, significant = 4): string {
  if (!Number.isFinite(price) || price <= 0) return '0'
  if (price >= 0.0001) return price.toLocaleString('en-US', { maximumSignificantDigits: significant })
  const zeros = Math.ceil(-Math.log10(price)) - 1
  const digits = Math.round(price * 10 ** (zeros + significant))
    .toString()
    .slice(0, significant)
    .replace(/(\d)0+$/, '$1')
  const sub = String(zeros)
    .split('')
    .map((d) => SUBSCRIPT[Number(d)])
    .join('')
  return `0.0${sub}${digits}`
}
