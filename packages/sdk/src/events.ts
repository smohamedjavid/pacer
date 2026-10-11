import { BorshCoder, type Idl } from '@coral-xyz/anchor'
import type BN from 'bn.js'
import type { Connection, PublicKey, VersionedTransactionResponse } from '@solana/web3.js'
import { derivePaceState, PACER_IDL, PACER_PROGRAM_ID, pacerErrorFromLogs } from './core.js'

/** A `PacedBuy` event: supply left the curve within the clock's allowance. */
export interface PacedBuyEvent {
  name: 'PacedBuy'
  mint: PublicKey
  amount: bigint
  /** Net supply outside the curve after this buy. */
  netOut: bigint
  /** Supply the clock had released when this buy landed. */
  released: bigint
  /** On-chain unix timestamp of the buy. */
  ts: number
}

/** A `PacedSell` event: supply returned to the curve and freed allowance. */
export interface PacedSellEvent {
  name: 'PacedSell'
  mint: PublicKey
  amount: bigint
  netOut: bigint
}

/** A `PaceInitialized` event: the issuance clock started. */
export interface PaceInitializedEvent {
  name: 'PaceInitialized'
  mint: PublicKey
  pool: PublicKey
  startTs: number
  openingTranche: bigint
  releasePerSecond: bigint
  maxPerBuy: bigint
  burstCapacity: bigint
}

export type PacerEvent = PacedBuyEvent | PacedSellEvent | PaceInitializedEvent

interface ActivityBase {
  signature: string
  slot: number
  /** Block time of the transaction (unix seconds), when the RPC knows it. */
  blockTime: number | null
  /** Fee payer of the transaction, usually the trader. */
  trader: PublicKey | null
}

export type PaceActivity =
  | (ActivityBase & { kind: 'buy'; amount: bigint; netOut: bigint; released: bigint; ts: number })
  | (ActivityBase & { kind: 'sell'; amount: bigint; netOut: bigint })
  /** A buy the hook reverted on-chain (only visible when the sender skipped preflight). */
  | (ActivityBase & { kind: 'rejected'; reason: string; attempted: bigint | null })

const coder = new BorshCoder(PACER_IDL as unknown as Idl)
const INVOKE = /^Program (\w+) invoke \[\d+\]$/
const EXIT = /^Program (\w+) (success|failed)/
const DATA_PREFIX = 'Program data: '
const PACER_ID = PACER_PROGRAM_ID.toBase58()

const toBigInt = (v: unknown): bigint => BigInt((v as BN).toString())
const toNumber = (v: unknown): number => Number((v as BN).toString())

function toPacerEvent(name: string, data: Record<string, unknown>): PacerEvent | null {
  switch (name) {
    case 'PacedBuy':
      return {
        name,
        mint: data.mint as PublicKey,
        amount: toBigInt(data.amount),
        netOut: toBigInt(data.net_out),
        released: toBigInt(data.released),
        ts: toNumber(data.ts),
      }
    case 'PacedSell':
      return { name, mint: data.mint as PublicKey, amount: toBigInt(data.amount), netOut: toBigInt(data.net_out) }
    case 'PaceInitialized':
      return {
        name,
        mint: data.mint as PublicKey,
        pool: data.pool as PublicKey,
        startTs: toNumber(data.start_ts),
        openingTranche: toBigInt(data.opening_tranche),
        releasePerSecond: toBigInt(data.release_per_second),
        maxPerBuy: toBigInt(data.max_per_buy),
        burstCapacity: toBigInt(data.burst_capacity),
      }
    default:
      return null
  }
}

/**
 * Decode Pacer events from transaction logs.
 *
 * Pacer runs as a transfer hook, i.e. a CPI three levels deep (DBC → Token-2022 → Pacer).
 * Anchor's `EventParser` only follows the top-level program, so this walks the invocation
 * stack itself and decodes `Program data:` lines emitted while Pacer is executing.
 */
export function parsePacerEvents(logs: readonly string[]): PacerEvent[] {
  const stack: string[] = []
  const events: PacerEvent[] = []
  for (const line of logs) {
    const invoke = INVOKE.exec(line)
    if (invoke) {
      stack.push(invoke[1]!)
      continue
    }
    if (EXIT.test(line)) {
      stack.pop()
      continue
    }
    if (stack.at(-1) !== PACER_ID || !line.startsWith(DATA_PREFIX)) continue
    const decoded = coder.events.decode(line.slice(DATA_PREFIX.length))
    if (!decoded) continue
    const event = toPacerEvent(decoded.name, decoded.data as Record<string, unknown>)
    if (event) events.push(event)
  }
  return events
}

const ATTEMPTED = /pacer: buy (\d+) > (?:burst )?available/

/** Turn one transaction into the paced buys, sells or clock rejections it contains. */
export function paceActivityFromTransaction(signature: string, tx: VersionedTransactionResponse): PaceActivity[] {
  const logs = tx.meta?.logMessages ?? []
  const base: ActivityBase = {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    trader: tx.transaction.message.staticAccountKeys[0] ?? null,
  }
  if (tx.meta?.err) {
    const reason = pacerErrorFromLogs(logs)
    if (!reason) return []
    const attempted = logs.map((l) => ATTEMPTED.exec(l)?.[1]).find((v) => v !== undefined)
    return [{ ...base, kind: 'rejected', reason, attempted: attempted ? BigInt(attempted) : null }]
  }
  const activity: PaceActivity[] = []
  for (const event of parsePacerEvents(logs)) {
    if (event.name === 'PacedBuy') {
      const { amount, netOut, released, ts } = event
      activity.push({ ...base, kind: 'buy', amount, netOut, released, ts })
    } else if (event.name === 'PacedSell') {
      activity.push({ ...base, kind: 'sell', amount: event.amount, netOut: event.netOut })
    }
  }
  return activity
}

export interface FetchPaceActivityOptions {
  /** Most signatures to scan (newest first). Default 250, RPC maximum 1000. */
  limit?: number
  /** Only return activity newer than this signature (exclusive). */
  until?: string
  /** Only return activity older than this signature (exclusive). */
  before?: string
  /** Transactions fetched per RPC batch. Default 25 (public RPCs throttle large batches). */
  batchSize?: number
  /** Batches in flight at once. Default 4. */
  concurrency?: number
}

/**
 * Paced buys, sells and clock rejections for a launch, newest first.
 * Every trade touches the launch's `PaceState` account, so its signature history is the trade log.
 */
export async function fetchPaceActivity(
  connection: Connection,
  mint: PublicKey,
  options: FetchPaceActivityOptions = {}
): Promise<PaceActivity[]> {
  const { limit = 250, until, before, batchSize = 25, concurrency = 4 } = options
  const signatures = await connection.getSignaturesForAddress(
    derivePaceState(mint),
    { limit, until, before },
    'confirmed'
  )
  const batches: string[][] = []
  for (let i = 0; i < signatures.length; i += batchSize) {
    batches.push(signatures.slice(i, i + batchSize).map((s) => s.signature))
  }
  // A few batches in flight at once: fast on a private RPC, polite on a public one.
  const results: PaceActivity[][] = []
  for (let i = 0; i < batches.length; i += concurrency) {
    const wave = await Promise.all(
      batches.slice(i, i + concurrency).map(async (batch) => {
        const txs = await connection.getTransactions(batch, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        })
        return txs.flatMap((tx, j) => (tx ? paceActivityFromTransaction(batch[j]!, tx) : []))
      })
    )
    results.push(...wave)
  }
  return results.flat()
}
