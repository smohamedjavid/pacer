import Link from 'next/link'
import { buttonStyles } from '@/components/ui/button-styles'
import { HeroClock } from './HeroClock'

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-20">
      <div>
        <h1 className="font-display text-[2.15rem] leading-[1.12] tracking-[-0.01em] text-ivory sm:text-5xl sm:leading-[1.08]">
          Price discovery on a schedule.
        </h1>
        <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-fog">
          Pacer is an issuance clock for Meteora Dynamic Bonding Curve launches. Supply is released at a rate the
          creator publishes up front, so no wallet can buy the curve in one block and the price forms over minutes or
          hours instead.
        </p>
        <p className="mt-4 max-w-[34rem] leading-relaxed text-steel">
          Built for assets that need a fair open: real-world assets, internet capital markets and agent tokens.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/launch" className={buttonStyles.primary}>
            Launch a token
          </Link>
          <Link href="/#launches" className={buttonStyles.secondary}>
            See live launches
          </Link>
        </div>
      </div>
      <HeroClock />
    </section>
  )
}
