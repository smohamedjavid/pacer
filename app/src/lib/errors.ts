import { pacerErrorFromLogs } from '@pacer/sdk'
import { SendTransactionError } from '@solana/web3.js'

/** A transaction that failed in simulation or on-chain, with the program logs that explain why. */
export class TransactionFailedError extends Error {
  readonly logs: string[]

  constructor(message: string, logs: string[] = []) {
    super(message)
    this.name = 'TransactionFailedError'
    this.logs = logs
  }
}

const ANCHOR_MESSAGE = /Error Message: (.+?)\.?$/

/** The most specific human explanation available for a failed transaction. */
export function explainFailure(logs: readonly string[] | null | undefined, fallback: string): string {
  const list = logs ? [...logs] : []
  const pacer = pacerErrorFromLogs(list)
  if (pacer) return pacer
  for (const line of list) {
    const match = ANCHOR_MESSAGE.exec(line)
    if (match?.[1]) return match[1]
  }
  if (list.some((l) => l.includes('insufficient lamports') || l.includes('insufficient funds'))) {
    return 'Not enough SOL in this wallet to cover the trade and fees.'
  }
  return fallback
}

/** Turn anything thrown during a wallet flow into one sentence for the UI. */
export function describeError(error: unknown): string {
  if (error instanceof TransactionFailedError) return error.message
  if (error instanceof SendTransactionError) return explainFailure(error.logs, error.message)
  const message = error instanceof Error ? error.message : String(error)
  if (/reject|declin|cancel/i.test(message)) return 'The request was declined in your wallet.'
  if (/blockhash not found|block height exceeded/i.test(message)) {
    return 'The transaction expired before it landed. Try again.'
  }
  return message || 'Something went wrong. Try again.'
}
