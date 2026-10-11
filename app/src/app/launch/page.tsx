import type { Metadata } from 'next'
import { LaunchForm } from '@/components/launch/LaunchForm'

export const metadata: Metadata = {
  title: 'Launch a token',
  description: 'Launch a token on Meteora DBC with a published issuance schedule.',
}

export default function LaunchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      <h1 className="font-display text-3xl text-ivory sm:text-4xl">Launch on a schedule</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fog">
        Pick how fast supply is released. The schedule is fixed on-chain the moment the pool opens and nobody, including
        you, can change it.
      </p>
      <div className="mt-12">
        <LaunchForm />
      </div>
    </div>
  )
}
