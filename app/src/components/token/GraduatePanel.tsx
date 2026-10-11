'use client'

import { buildMigrateTx } from '@pacer/sdk'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { buttonStyles } from '@/components/ui/button-styles'
import { TxStatus } from '@/components/ui/TxStatus'
import { ConnectWalletButton } from '@/components/wallet/ConnectWalletButton'
import { useTransaction } from '@/hooks/useTransaction'
import { formatSol } from '@/lib/format'
import type { LaunchDetail } from '@/lib/launch'
import { queryKeys } from '@/lib/query-keys'

/** Shown once the curve is full: anyone can move it into its DAMM v2 pool. */
export function GraduatePanel({ launch }: { launch: LaunchDetail }) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const tx = useTransaction()

  async function graduate() {
    if (!publicKey) return
    await tx.run(
      async () => {
        const { transaction, firstPositionNftKeypair, secondPositionNftKeypair } = await buildMigrateTx(connection, {
          payer: publicKey,
          pool: launch.pace.pool,
        })
        return { transaction, signers: [firstPositionNftKeypair, secondPositionNftKeypair] }
      },
      {
        successMessage: 'Graduated. Trading continues in the DAMM v2 pool.',
        refresh: [queryKeys.launch(launch.mint), queryKeys.launches()],
      }
    )
  }

  return (
    <section aria-labelledby="graduate-heading" className="rounded-2xl border border-verdigris/40 bg-case/50 p-5">
      <h2 id="graduate-heading" className="font-semibold text-ivory">
        The curve is full
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-fog">
        {formatSol(launch.market.quoteReserve, 3)} SOL raised.{' '}
        {launch.hookActive ? 'DBC revokes the Pacer hook as the curve closes' : 'DBC has revoked the Pacer hook'}, and
        anyone can now graduate the pool into a compounding DAMM v2 pool with all of its liquidity permanently locked.
      </p>
      <div className="mt-5 space-y-3">
        {publicKey ? (
          <button
            type="button"
            onClick={() => void graduate()}
            disabled={tx.busy}
            className={`${buttonStyles.primary} w-full`}
          >
            Graduate to DAMM v2
          </button>
        ) : (
          <ConnectWalletButton className="w-full">Connect a wallet to graduate</ConnectWalletButton>
        )}
        <TxStatus state={tx.state} />
      </div>
    </section>
  )
}
