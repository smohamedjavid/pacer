import type { PublicKey } from '@solana/web3.js'
import { env } from './env'

function clusterQuery(): string {
  return env.cluster === 'devnet' ? '?cluster=devnet' : `?cluster=custom&customUrl=${encodeURIComponent(env.rpcUrl)}`
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${clusterQuery()}`
}

export function explorerAddressUrl(address: PublicKey | string): string {
  return `https://explorer.solana.com/address/${address.toString()}${clusterQuery()}`
}
