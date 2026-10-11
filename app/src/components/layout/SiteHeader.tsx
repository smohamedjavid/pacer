import Link from 'next/link'
import { PacerMark } from '@/components/clock/PacerMark'
import { WalletButton } from '@/components/wallet/WalletButton'
import { env } from '@/lib/env'

export function SiteHeader() {
  return (
    <header className="border-b border-rule/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md text-ivory" aria-label="Pacer home">
          <PacerMark className="size-7 text-ivory" />
          <span className="font-display text-sm tracking-[0.18em]">PACER</span>
        </Link>
        <span
          className="hidden rounded-full border border-rule px-2.5 py-0.5 text-2xs text-fog sm:inline-block"
          title={`RPC: ${env.rpcUrl}`}
        >
          {env.cluster === 'devnet' ? 'Devnet' : 'Localnet'}
        </span>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/#launches"
            className="hidden rounded-full px-3 py-2 text-sm text-fog transition-colors hover:text-ivory sm:inline-block"
          >
            Launches
          </Link>
          <Link
            href="/launch"
            className="rounded-full px-3 py-2 text-sm whitespace-nowrap text-fog transition-colors hover:text-ivory"
          >
            <span className="sm:hidden">Launch</span>
            <span className="hidden sm:inline">Launch a token</span>
          </Link>
          <WalletButton />
        </nav>
      </div>
    </header>
  )
}
