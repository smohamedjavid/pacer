import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'

export type Cluster = 'localnet' | 'devnet'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const CLUSTER: Cluster = (process.env.PACER_CLUSTER as Cluster | undefined) ?? 'localnet'
export const RPC_URL =
  process.env.RPC_URL ?? (CLUSTER === 'devnet' ? 'https://api.devnet.solana.com' : 'http://127.0.0.1:8899')

export const connection = new Connection(RPC_URL, 'confirmed')

export function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8')) as number[]))
}

export const deployer = loadKeypair(process.env.DEPLOYER_KEYPAIR ?? resolve(ROOT, '.keys/deployer.json'))

export function explorerTx(sig: string): string {
  const q = CLUSTER === 'devnet' ? '?cluster=devnet' : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`
  return `https://explorer.solana.com/tx/${sig}${q}`
}

export function explorerAddress(addr: PublicKey | string): string {
  const q = CLUSTER === 'devnet' ? '?cluster=devnet' : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`
  return `https://explorer.solana.com/address/${addr.toString()}${q}`
}

/** Fund a wallet: airdrop on localnet, transfer from the deployer on devnet. */
export async function fund(to: PublicKey, sol: number): Promise<void> {
  const lamports = Math.round(sol * LAMPORTS_PER_SOL)
  if (CLUSTER === 'localnet') {
    const sig = await connection.requestAirdrop(to, lamports)
    await connection.confirmTransaction(sig, 'confirmed')
    return
  }
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: to, lamports }))
  await sendAndConfirmTransaction(connection, tx, [deployer], { commitment: 'confirmed' })
}

export interface SendResult {
  ok: boolean
  signature?: string
  logs?: string[]
  error?: string
}

/** Send a transaction and capture logs on failure instead of throwing. */
export async function send(tx: Transaction, signers: Keypair[]): Promise<SendResult> {
  try {
    const signature = await sendAndConfirmTransaction(connection, tx, signers, {
      commitment: 'confirmed',
      skipPreflight: false,
    })
    return { ok: true, signature }
  } catch (err) {
    if (err instanceof SendTransactionError) {
      const logs = err.logs ?? (await err.getLogs(connection).catch(() => undefined)) ?? undefined
      return { ok: false, logs, error: err.message }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function chainTime(): Promise<number> {
  const slot = await connection.getSlot('confirmed')
  const t = await connection.getBlockTime(slot)
  return t ?? Math.floor(Date.now() / 1000)
}

export function writeRunReport(name: string, data: unknown): string {
  const dir = resolve(ROOT, 'demo-runs')
  mkdirSync(dir, { recursive: true })
  const file = resolve(dir, `${name}.json`)
  writeFileSync(file, JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
  return file
}
