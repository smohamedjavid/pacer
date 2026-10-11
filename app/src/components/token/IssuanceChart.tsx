'use client'

import type { PaceActivity } from '@pacer/sdk'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import { formatClock, formatPercent } from '@/lib/format'
import type { ClockReading, LaunchDetail } from '@/lib/launch'
import { curvePricer, formatPrice, spotPrice } from '@/lib/price'
import { releaseLine, releasedShareAt, scheduleShape, soldLine, valueAt, type SupplyPoint } from '@/lib/schedule'

const HEIGHT = 340
const M = { top: 22, right: 20, bottom: 34, left: 64 }
const PRICE_SAMPLES = 64

type Metric = 'supply' | 'price'
type Range = 'schedule' | 'recent'

const COPY = {
  supply: {
    title: 'Issuance clock',
    limit: 'Released by the clock',
    actual: 'Net sold',
    band: 'Buyable headroom',
  },
  price: {
    title: 'Price speed limit',
    limit: 'Highest price the clock allows',
    actual: 'Curve price',
    band: 'Room to rise',
  },
} as const

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.floor(entry.contentRect.width)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14_400, 21_600, 43_200, 86_400]

function timeTicks(max: number, count: number): number[] {
  if (max <= 0) return [0]
  const step = TIME_STEPS.find((s) => s >= max / count) ?? Math.ceil(max / count / 86_400) * 86_400
  const ticks: number[] = []
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t)
  return ticks
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full border border-rule p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 transition-colors ${value === o.value ? 'bg-ivory text-dial' : 'text-fog hover:text-ivory'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface IssuanceChartProps {
  launch: LaunchDetail
  reading: ClockReading
  activity: readonly PaceActivity[] | undefined
  now: number
  /** False once the curve has closed: the clock no longer matters, so "now" is not drawn. */
  live: boolean
}

/**
 * The issuance clock over time, as supply or as price.
 * Supply: the gilt line is what the clock has released, the ivory step line is net supply sold.
 * Price: because supply out of the curve is capped by the clock, so is the curve price; the gilt
 * line is that ceiling and the ivory line is the price the curve actually reached.
 */
export function IssuanceChart({ launch, reading, activity, now, live }: IssuanceChartProps) {
  const [containerRef, width] = useWidth<HTMLDivElement>()
  const clipId = useId()
  const { pace, market, poolConfig } = launch
  const shape = useMemo(() => scheduleShape(pace, market.curveSupply), [pace, market.curveSupply])
  const priceOf = useMemo(() => curvePricer(poolConfig), [poolConfig])
  const [metric, setMetric] = useState<Metric>('supply')
  const [range, setRange] = useState<Range>(shape.duration > 2 * 3600 ? 'recent' : 'schedule')
  const [hoverT, setHoverT] = useState<number | null>(null)

  const { points: sold, interpolatedUntil } = useMemo(
    () => soldLine(activity ?? [], pace, market.curveSupply, live ? now : pace.startTs + shape.duration),
    [activity, pace, market.curveSupply, live, now, shape.duration]
  )
  const lastTradeT = sold[sold.length - 1]?.t ?? 0
  const nowT = live ? reading.elapsed : lastTradeT
  const xMax =
    range === 'schedule'
      ? Math.max(shape.duration * 1.04, live ? reading.elapsed * 1.02 : lastTradeT * 1.04, 10)
      : Math.max(nowT * 1.25, nowT + 60, 60)

  // Series in the chosen metric. Supply is a share of curve supply; price is SOL per token.
  const shareToPrice = useCallback(
    (share: number) => priceOf(BigInt(Math.round(share * Number(market.curveSupply)))),
    [priceOf, market.curveSupply]
  )
  const limitLine: SupplyPoint[] = useMemo(() => {
    if (metric === 'supply') return releaseLine(shape, xMax)
    const points: SupplyPoint[] = [{ t: 0, v: shareToPrice(0) }]
    for (let i = 0; i <= PRICE_SAMPLES; i++) {
      const t = (i / PRICE_SAMPLES) * xMax
      points.push({ t, v: shareToPrice(releasedShareAt(shape, t)) })
    }
    return points
  }, [metric, shape, xMax, shareToPrice])
  const actualLine = metric === 'supply' ? sold : sold.map((p) => ({ t: p.t, v: shareToPrice(p.v) }))

  const limitAt = (t: number) => (metric === 'supply' ? releasedShareAt(shape, t) : valueAt(limitLine, t))
  const limitNow = limitAt(nowT)
  const actualNow = metric === 'supply' ? valueAt(sold, nowT) : spotPrice(launch.virtualPool)

  const [yMin, yMax] = (() => {
    if (metric === 'supply') {
      if (range === 'schedule') return [0, 1]
      return [0, Math.min(1, Math.max(limitAt(xMax), actualNow) * 1.12) || 0.1]
    }
    const floor = shareToPrice(0)
    const top = Math.max(limitAt(xMax), actualNow)
    const pad = (top - floor) * 0.08 || top * 0.05
    return [Math.max(0, floor - pad), top + pad]
  })()

  const innerW = width - M.left - M.right
  const innerH = HEIGHT - M.top - M.bottom
  const x = (t: number) => M.left + (Math.min(Math.max(t, 0), xMax) / xMax) * innerW
  const y = (v: number) => M.top + innerH - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * innerH
  const path = (points: readonly SupplyPoint[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')

  const pastLimit = [...limitLine.filter((p) => p.t < nowT), { t: nowT, v: limitNow }]
  const futureLimit = [{ t: nowT, v: limitNow }, ...limitLine.filter((p) => p.t > nowT)]
  const actualUntilNow = actualLine.filter((p) => p.t <= nowT)
  // Trades read from events; the interpolated stretch (if any) is drawn separately.
  const recorded = interpolatedUntil === null ? actualUntilNow : actualUntilNow.filter((p) => p.t >= interpolatedUntil)
  const band = `${path(pastLimit)} ${[...actualUntilNow]
    .reverse()
    .map((p) => `L${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(' ')} Z`

  const formatY = (v: number) =>
    metric === 'supply' ? formatPercent(v, v === 0 || v === 1 ? 0 : 1) : formatPrice(v, 3)
  const yTicks =
    metric === 'supply' && range === 'schedule'
      ? [0, 0.25, 0.5, 0.75, 1]
      : [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin))
  const xTicks = timeTicks(xMax, width < 520 ? 3 : 6)
  const copy = COPY[metric]

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const t = ((((event.clientX - rect.left) / rect.width) * width - M.left) / innerW) * xMax
    setHoverT(t >= 0 && t <= xMax ? t : null)
  }
  const hover =
    hoverT === null
      ? null
      : { t: hoverT, limit: limitAt(hoverT), actual: hoverT <= nowT ? valueAt(actualLine, hoverT) : null }
  const nowLabelLeft = x(nowT) > width - 150

  const summary =
    metric === 'supply'
      ? `${formatPercent(reading.releasedFraction)} of curve supply released, ${formatPercent(reading.soldFraction)} sold.`
      : `Curve price ${formatPrice(actualNow)} SOL, ceiling right now ${formatPrice(limitNow)} SOL.`

  return (
    <figure className="rounded-2xl border border-rule bg-case/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption>
          <h2 className="font-semibold text-ivory">{copy.title}</h2>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fog" aria-label="Legend">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded bg-gilt" /> {copy.limit}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded bg-ivory" /> {copy.actual}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-4 rounded-sm bg-gilt/30" /> {copy.band}
            </li>
          </ul>
        </figcaption>
        <div className="flex flex-wrap gap-2">
          <Segmented
            label="Chart metric"
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'supply', label: 'Supply' },
              { value: 'price', label: 'Price' },
            ]}
          />
          <Segmented
            label="Chart range"
            value={range}
            onChange={setRange}
            options={[
              { value: 'schedule', label: 'Full clock' },
              { value: 'recent', label: 'Up to now' },
            ]}
          />
        </div>
      </div>

      <div ref={containerRef} className="relative mt-4">
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={`${copy.title}: ${summary}`}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverT(null)}
          className="block touch-pan-y select-none"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={M.left} y={M.top - 4} width={innerW + 2} height={innerH + 8} />
            </clipPath>
            <linearGradient id={`${clipId}-band`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-gilt)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--color-gilt)" stopOpacity="0.08" />
            </linearGradient>
          </defs>

          {yTicks.map((v, i) => (
            <g key={i}>
              <line
                x1={M.left}
                x2={M.left + innerW}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--color-rule)"
                strokeDasharray={i === 0 ? undefined : '2 4'}
              />
              <text
                x={M.left - 8}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="central"
                className="readout"
                fill="var(--color-steel)"
                fontSize="10"
              >
                {formatY(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={t}
              x={x(t)}
              y={HEIGHT - 12}
              textAnchor="middle"
              className="readout"
              fill="var(--color-steel)"
              fontSize="10"
            >
              +{formatClock(t)}
            </text>
          ))}
          {metric === 'price' && (
            <text x={M.left} y={10} className="readout" fill="var(--color-steel)" fontSize="10">
              SOL per token
            </text>
          )}

          <g clipPath={`url(#${clipId})`}>
            <path d={band} fill={`url(#${clipId}-band)`} />
            <path
              d={path(futureLimit)}
              fill="none"
              stroke="var(--color-gilt)"
              strokeWidth="1.5"
              strokeDasharray="5 5"
              opacity="0.6"
            />
            <path d={path(pastLimit)} fill="none" stroke="var(--color-gilt)" strokeWidth="2.25" />
            {interpolatedUntil !== null && (
              <path
                d={path(actualLine.filter((p) => p.t <= interpolatedUntil))}
                fill="none"
                stroke="var(--color-ivory)"
                strokeWidth="1.5"
                strokeDasharray="3 4"
                opacity="0.55"
              />
            )}
            <path
              d={path(recorded.length > 1 ? recorded : actualLine)}
              fill="none"
              stroke="var(--color-ivory)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>

          {live && (
            <g>
              <line
                x1={x(nowT)}
                x2={x(nowT)}
                y1={M.top}
                y2={M.top + innerH}
                stroke="var(--color-gilt)"
                strokeOpacity="0.55"
              />
              <line
                x1={x(nowT)}
                x2={x(nowT)}
                y1={y(limitNow)}
                y2={y(actualNow)}
                stroke="var(--color-gilt)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <circle
                cx={x(nowT)}
                cy={y(limitNow)}
                r="4.5"
                fill="var(--color-dial)"
                stroke="var(--color-gilt)"
                strokeWidth="2"
              />
              <circle cx={x(nowT)} cy={y(actualNow)} r="3.5" fill="var(--color-ivory)" />
              <text
                x={x(nowT) + (nowLabelLeft ? -8 : 8)}
                y={M.top + innerH - 8}
                textAnchor={nowLabelLeft ? 'end' : 'start'}
                fill="var(--color-gilt)"
                fontSize="11"
                className="readout"
              >
                now +{formatClock(nowT)}
              </text>
              {metric === 'price' && (
                <text
                  x={x(nowT) + (nowLabelLeft ? -10 : 10)}
                  y={Math.max(y(limitNow) - 10, M.top + 12)}
                  textAnchor={nowLabelLeft ? 'end' : 'start'}
                  fill="var(--color-gilt)"
                  fontSize="11"
                  className="readout"
                >
                  max {formatPrice(limitNow)}
                </text>
              )}
            </g>
          )}

          {hover && (
            <g pointerEvents="none">
              <line
                x1={x(hover.t)}
                x2={x(hover.t)}
                y1={M.top}
                y2={M.top + innerH}
                stroke="var(--color-fog)"
                strokeOpacity="0.5"
                strokeDasharray="2 3"
              />
              <circle cx={x(hover.t)} cy={y(hover.limit)} r="3" fill="var(--color-gilt)" />
              {hover.actual !== null && <circle cx={x(hover.t)} cy={y(hover.actual)} r="3" fill="var(--color-ivory)" />}
            </g>
          )}
        </svg>

        {hover && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-8 rounded-lg border border-rule-strong bg-dial/95 px-3 py-2 text-xs shadow-lg"
            style={
              x(hover.t) > width / 2
                ? { right: `${((width - x(hover.t) + 12) / width) * 100}%` }
                : { left: `${((x(hover.t) + 12) / width) * 100}%` }
            }
          >
            <p className="readout text-fog">+{formatClock(hover.t)}</p>
            <p className="readout mt-1 text-gilt">
              {metric === 'supply' ? 'released' : 'ceiling'} {formatY(hover.limit)}
            </p>
            {hover.actual !== null && (
              <p className="readout text-ivory">
                {metric === 'supply' ? 'sold' : 'price'} {formatY(hover.actual)}
              </p>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-steel">
        {activity === undefined
          ? 'Loading trade history…'
          : interpolatedUntil !== null
            ? 'This RPC no longer serves the oldest trades, so the dashed stretch is interpolated.'
            : metric === 'price'
              ? 'Supply out of the curve can never pass the release line, so neither can the price.'
              : 'The curve can never give out more than the gilt line; the ivory line is what buyers hold.'}
      </p>
    </figure>
  )
}
