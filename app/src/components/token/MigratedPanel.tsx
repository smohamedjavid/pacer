import { CopyAddress } from '@/components/ui/CopyAddress'
import { ExternalLink } from '@/components/ui/ExternalLink'
import { explorerAddressUrl } from '@/lib/explorer'
import { formatSol } from '@/lib/format'
import type { LaunchDetail } from '@/lib/launch'

/** Shown after graduation: where the token trades now and what changed. */
export function MigratedPanel({ launch }: { launch: LaunchDetail }) {
  return (
    <section aria-labelledby="migrated-heading" className="rounded-2xl border border-verdigris/40 bg-case/50 p-5">
      <h2 id="migrated-heading" className="font-semibold text-ivory">
        Graduated to DAMM v2
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-fog">
        The curve raised {formatSol(launch.market.quoteReserve, 3)} SOL on schedule. Trading now happens in a
        compounding DAMM v2 pool.
      </p>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-steel">DAMM v2 pool</dt>
          <dd>
            <CopyAddress address={launch.dammPool} label="DAMM v2 pool address" />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-steel">Transfer hook</dt>
          <dd className={launch.hookActive ? 'text-gilt' : 'text-verdigris'}>
            {launch.hookActive ? 'Active' : 'Revoked'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-steel">Liquidity</dt>
          <dd className="text-ivory">100% permanently locked</dd>
        </div>
      </dl>
      <p className="mt-5 text-sm text-fog">
        <ExternalLink href={explorerAddressUrl(launch.dammPool)}>Open the pool on Explorer</ExternalLink>
      </p>
    </section>
  )
}
