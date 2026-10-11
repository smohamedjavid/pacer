import type { PaceActivity, PaceStateView } from '@pacer/sdk'
import { ratio } from './units'

/** A point on a supply chart: seconds since the clock opened, share of curve supply (0..1). */
export interface SupplyPoint {
  t: number
  v: number
}

export interface ScheduleShape {
  /** Share of curve supply released at open. */
  opening: number
  /** Seconds until everything is released. */
  duration: number
}

/** Released share at `t` seconds after open: opening tranche, then linear to 100% at `duration`. */
export function releasedShareAt(shape: ScheduleShape, t: number): number {
  if (t < 0) return 0
  if (shape.duration <= 0) return 1
  return Math.min(1, shape.opening + (1 - shape.opening) * (t / shape.duration))
}

export function scheduleShape(pace: PaceStateView, curveSupply: bigint): ScheduleShape {
  const opening = Math.min(1, ratio(pace.openingTranche, curveSupply))
  const rest = curveSupply > pace.openingTranche ? curveSupply - pace.openingTranche : 0n
  const duration =
    pace.releasePerSecond === 0n ? 0 : Number((rest + pace.releasePerSecond - 1n) / pace.releasePerSecond)
  return { opening, duration }
}

/** The release line as chart points (a jump at open, a ramp, then flat). */
export function releaseLine(shape: ScheduleShape, until: number): SupplyPoint[] {
  const end = Math.max(until, shape.duration)
  const points: SupplyPoint[] = [
    { t: 0, v: 0 },
    { t: 0, v: shape.opening },
    { t: shape.duration, v: 1 },
  ]
  if (end > shape.duration) points.push({ t: end, v: 1 })
  return points
}

const INTERPOLATION_SAMPLES = 32

export interface SoldLine {
  points: SupplyPoint[]
  /**
   * Set when the RPC no longer serves the launch's oldest trades: points up to this time are
   * interpolated from zero to the first known trade rather than read from events.
   */
  interpolatedUntil: number | null
}

/**
 * Net supply sold over time as a step line, from Pacer events plus the live state.
 * Buys carry the on-chain clock timestamp; sells use their block time.
 */
export function soldLine(
  activity: readonly PaceActivity[],
  pace: PaceStateView,
  curveSupply: bigint,
  now: number
): SoldLine {
  const trades = [...activity].reverse().filter((item) => item.kind !== 'rejected')
  const timeOf = (item: (typeof trades)[number]) =>
    Math.max(0, (item.kind === 'buy' ? item.ts : (item.blockTime ?? pace.startTs)) - pace.startTs)

  // History is complete when the oldest trade started from zero supply out.
  const first = trades[0]
  const before = !first ? pace.netOut : first.kind === 'buy' ? first.netOut - first.amount : first.netOut + first.amount
  const interpolatedUntil = before > 0n ? (first ? timeOf(first) : Math.max(0, now - pace.startTs)) : null

  const points: SupplyPoint[] = [{ t: 0, v: 0 }]
  if (interpolatedUntil !== null) {
    // Sampled, not a single segment, so it stays a straight line in supply space after any
    // monotonic mapping (e.g. to price) instead of becoming a chord across a convex curve.
    const target = ratio(before, curveSupply)
    for (let i = 1; i <= INTERPOLATION_SAMPLES; i++) {
      const f = i / INTERPOLATION_SAMPLES
      points.push({ t: interpolatedUntil * f, v: target * f })
    }
  }
  for (const item of trades) {
    const t = timeOf(item)
    const previous = points[points.length - 1]!
    points.push({ t, v: previous.v }, { t, v: ratio(item.netOut, curveSupply) })
  }
  const last = points[points.length - 1]!
  const current = ratio(pace.netOut, curveSupply)
  const end = Math.max(last.t, now - pace.startTs)
  points.push({ t: end, v: last.v })
  if (Math.abs(current - last.v) > 1e-9) points.push({ t: end, v: current })
  return { points, interpolatedUntil }
}

/** Value of a step/linear series at `t` (linear interpolation between points). */
export function valueAt(points: readonly SupplyPoint[], t: number): number {
  let value = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    if (p.t > t) {
      const prev = points[i - 1]
      if (!prev || p.t === prev.t) return value
      return prev.v + ((p.v - prev.v) * (t - prev.t)) / (p.t - prev.t)
    }
    value = p.v
  }
  return value
}
