import { PublicKey } from '@solana/web3.js'

export type Cluster = 'devnet' | 'localnet'

/** Shared devnet DBC config for app launches (graduates at 1 SOL). */
const DEVNET_PACER_CONFIG = 'CAf9Dia6vT3QhLFYxvYB2dHHZGJVHpLVaChYxqhEdSan'

function parseCluster(value: string | undefined): Cluster {
  return value === 'localnet' ? 'localnet' : 'devnet'
}

function parsePublicKey(value: string | undefined): PublicKey | null {
  if (!value) return null
  try {
    return new PublicKey(value)
  } catch {
    console.error(`NEXT_PUBLIC_PACER_CONFIG is not a valid address: ${value}`)
    return null
  }
}

const cluster = parseCluster(process.env.NEXT_PUBLIC_CLUSTER)
const isDevnet = cluster === 'devnet'

/** Public runtime configuration. `NEXT_PUBLIC_*` values are inlined at build time. */
export const env = {
  cluster,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || (isDevnet ? 'https://api.devnet.solana.com' : 'http://127.0.0.1:8899'),
  /** Shared DBC config every launch from this app goes into. */
  pacerConfig: parsePublicKey(process.env.NEXT_PUBLIC_PACER_CONFIG || (isDevnet ? DEVNET_PACER_CONFIG : undefined)),
  /** Poll cadence in ms. Public devnet answers bursts with 429s, so it is polled gently. */
  poll: isDevnet
    ? { launch: 3_000, launches: 15_000, activity: 10_000, balances: 10_000 }
    : { launch: 2_000, launches: 6_000, activity: 3_000, balances: 4_000 },
} as const
