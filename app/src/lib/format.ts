import type { PublicKey } from '@solana/web3.js'
import { BASE_DECIMALS, QUOTE_DECIMALS } from './units'

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })

function toDecimal(units: bigint, decimals: number): number {
  return Number(units) / 10 ** decimals
}

/** Base units as whole tokens: 39,999,998 */
export function formatTokens(units: bigint): string {
  return integer.format(Math.floor(toDecimal(units, BASE_DECIMALS)))
}

/** Base units as compact tokens: 40M */
export function formatTokensCompact(units: bigint): string {
  return compact.format(toDecimal(units, BASE_DECIMALS))
}

/** Lamports as SOL with sensible precision: 1.2345 */
export function formatSol(lamports: bigint, maximumFractionDigits = 4): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(toDecimal(lamports, QUOTE_DECIMALS))
}

/** 0.4231 → "42.3%" */
export function formatPercent(fraction: number, digits = 1): string {
  return `${(Math.max(0, fraction) * 100).toFixed(digits)}%`
}

/** Seconds as a clock reading: 75 → "01:15", 3725 → "1:02:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Seconds as a human duration: 600 → "10 min", 14400 → "4 h", 5400 → "1 h 30 min" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} s`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Seconds ago as a short relative time: "12 s ago", "4 min ago" */
export function formatAgo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86_400)} d ago`
}

export function shortAddress(address: PublicKey | string, chars = 4): string {
  const s = address.toString()
  return `${s.slice(0, chars)}…${s.slice(-chars)}`
}

/** Local wall-clock time for a unix timestamp: "14:32" */
export function formatTimeOfDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
