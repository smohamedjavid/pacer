import type { ReactNode } from 'react'

const W = 280
const H = 140
const PAD = 8

function toPath(points: Array<[number, number]>): string {
  return points
    .map(([t, v], i) => `${i === 0 ? 'M' : 'L'} ${PAD + t * (W - 2 * PAD)} ${H - PAD - v * (H - 2 * PAD)}`)
    .join(' ')
}

// Plain curve: the first block takes most of the supply.
const SWEPT: Array<[number, number]> = [
  [0, 0],
  [0.02, 0],
  [0.02, 0.82],
  [0.4, 0.86],
  [1, 0.9],
]

// Paced: a release ramp, and buyers stepping up underneath it.
const RAMP: Array<[number, number]> = [
  [0, 0.05],
  [0.85, 1],
  [1, 1],
]
const PACED: Array<[number, number]> = []
for (let i = 0, sold = 0; i <= 12; i++) {
  const t = (i / 12) * 0.85
  const next = (0.05 + (t / 0.85) * 0.95) * 0.93
  PACED.push([t, sold], [t, next])
  sold = next
}

function MiniChart({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <figure className="rounded-2xl border border-rule bg-case/60 p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-ivory">{title}</span>
        <span className="text-xs text-steel">supply sold over time</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label={caption}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--color-rule-strong)" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--color-rule-strong)" />
        {children}
      </svg>
      <p className="mt-3 text-sm leading-relaxed text-fog">{caption}</p>
    </figure>
  )
}

export function WhyPacing() {
  return (
    <section aria-labelledby="why-heading" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-10 md:grid-cols-[1fr_1.4fr] md:gap-14">
        <div>
          <h2 id="why-heading" className="font-display text-xl text-ivory sm:text-2xl">
            One block should not set the price
          </h2>
          <p className="mt-5 leading-relaxed text-fog">
            On an open bonding curve, whoever lands first can buy most of the supply before anyone else sees the pool.
            Anti-snipe fees only make that first block more expensive; a bot with enough SOL pays and wins.
          </p>
          <p className="mt-4 leading-relaxed text-fog">
            Pacer removes the prize instead. The curve only gives out what the schedule has released, so a sweep reverts
            on-chain and every buyer gets the same chance to price the asset as supply arrives.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MiniChart title="Open curve" caption="A sniper sweeps most of the curve in the first block.">
            <path d={toPath(SWEPT)} fill="none" stroke="var(--color-signal)" strokeWidth="2" />
          </MiniChart>
          <MiniChart title="Paced curve" caption="Buys follow the release line; the sweep reverts.">
            <path d={toPath(RAMP)} fill="none" stroke="var(--color-gilt)" strokeWidth="1.5" strokeDasharray="4 4" />
            <path d={toPath(PACED)} fill="none" stroke="var(--color-ivory)" strokeWidth="2" />
          </MiniChart>
        </div>
      </div>
    </section>
  )
}
