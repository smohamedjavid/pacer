/** Base token decimals for every Pacer launch (DBC config `tokenBaseDecimal`). */
export const BASE_DECIMALS = 6
/** Quote is SOL. */
export const QUOTE_DECIMALS = 9

/**
 * Parse a user-typed decimal ("1,250.5") into integer base units without going through floats.
 * Returns null when the input is not a valid non-negative number with at most `decimals` places.
 */
export function parseUnits(input: string, decimals: number): bigint | null {
  const cleaned = input.replace(/[,_\s]/g, '')
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null
  const [whole = '', fraction = ''] = cleaned.split('.')
  if (fraction.length > decimals) return null
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
}

/** Integer units to a plain decimal string ("1250.5"), suitable for an input value. */
export function unitsToDecimalString(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals)
  const whole = units / scale
  const fraction = (units % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

/** Ratio of two bigints as a float in [0, ∞). */
export function ratio(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0
  // Keep 6 significant decimals without overflowing Number for large u64 values.
  return Number((numerator * 1_000_000n) / denominator) / 1_000_000
}

export function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}
