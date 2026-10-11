import { CopyAddress } from '@/components/ui/CopyAddress'
import { ExternalLink } from '@/components/ui/ExternalLink'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { explorerAddressUrl } from '@/lib/explorer'
import type { LaunchPhase, LaunchSummary } from '@/lib/launch'

export function TokenHeader({ launch, phase }: { launch: LaunchSummary; phase: LaunchPhase }) {
  const symbol = launch.token?.symbol ?? 'Unnamed'
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-ivory sm:text-4xl">{symbol}</h1>
          <StatusBadge phase={phase} />
        </div>
        <p className="mt-2 text-fog">{launch.token?.name ?? 'Token without on-chain metadata'}</p>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <dt className="text-steel">Mint</dt>
          <dd>
            <CopyAddress address={launch.mint} label="mint address" />
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-steel">DBC pool</dt>
          <dd>
            <CopyAddress address={launch.pace.pool} label="pool address" />
          </dd>
        </div>
        <div>
          <dt className="sr-only">Explorer</dt>
          <dd className="text-fog">
            <ExternalLink href={explorerAddressUrl(launch.mint)}>View on Explorer</ExternalLink>
          </dd>
        </div>
      </dl>
    </header>
  )
}
