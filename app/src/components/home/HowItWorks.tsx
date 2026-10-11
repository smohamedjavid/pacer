const STEPS = [
  {
    title: 'The clock releases supply',
    body: 'At launch the creator publishes an opening tranche and a release rate. From then on, the curve can only give out what the clock has released.',
    detail: 'released(t) = opening + rate × t',
  },
  {
    title: 'Buys cannot outrun the clock',
    body: 'Every buy passes through the Pacer transfer hook. One that would take more than has been released reverts. Sells return supply and free allowance; wallet transfers pass untouched.',
    detail: 'net sold ≤ released(now)',
  },
  {
    title: 'It graduates to DAMM v2',
    body: 'When the curve fills, DBC revokes the hook and anyone can migrate the pool into a compounding DAMM v2 pool with all of its liquidity locked for good.',
    detail: 'hook revoked, 100% LP locked',
  },
] as const

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="border-y border-rule/70 bg-well/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="how-heading" className="font-display text-xl text-ivory sm:text-2xl">
          How a paced launch runs
        </h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative md:pr-4">
              <div className="flex items-center gap-3">
                <span className="readout flex size-8 shrink-0 items-center justify-center rounded-full border border-gilt/60 text-xs text-gilt">
                  {i + 1}
                </span>
                <span aria-hidden className="h-px flex-1 bg-rule" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-ivory">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-fog">{step.body}</p>
              <p className="readout mt-4 text-xs text-steel">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
