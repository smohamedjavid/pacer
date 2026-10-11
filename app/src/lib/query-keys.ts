import type { PublicKey } from '@solana/web3.js'

/** Every TanStack Query key in the app, so invalidation after a trade stays in one place. */
export const queryKeys = {
  launches: () => ['launches'] as const,
  launch: (mint: PublicKey) => ['launch', mint.toBase58()] as const,
  activity: (mint: PublicKey) => ['activity', mint.toBase58()] as const,
  balances: (mint: PublicKey, owner: PublicKey | null) =>
    ['balances', mint.toBase58(), owner?.toBase58() ?? null] as const,
  curveSupply: (config: PublicKey) => ['curve-supply', config.toBase58()] as const,
}
