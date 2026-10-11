import {
  VersionedTransaction,
  type Connection,
  type Keypair,
  type PublicKey,
  type Transaction,
  type TransactionSignature,
} from '@solana/web3.js'
import { TransactionFailedError, explainFailure } from './errors'

export interface WalletSigner {
  publicKey: PublicKey
  signTransaction: <T extends Transaction>(transaction: T) => Promise<T>
}

export type SendPhase = 'simulating' | 'signing' | 'confirming'

export interface SendOptions {
  connection: Connection
  wallet: WalletSigner
  transaction: Transaction
  /** Extra keypairs that must co-sign (new mint, position NFTs). They sign before the wallet. */
  signers?: Keypair[]
  onPhase?: (phase: SendPhase) => void
}

/**
 * Simulate, co-sign, have the wallet sign, send and confirm a legacy transaction.
 * Simulating first surfaces Pacer's own revert reason instead of a generic wallet error.
 */
export async function sendWithWallet({
  connection,
  wallet,
  transaction,
  signers = [],
  onPhase,
}: SendOptions): Promise<TransactionSignature> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  transaction.feePayer = wallet.publicKey
  transaction.recentBlockhash = blockhash

  onPhase?.('simulating')
  const simulation = await connection.simulateTransaction(new VersionedTransaction(transaction.compileMessage()), {
    sigVerify: false,
    commitment: 'confirmed',
  })
  if (simulation.value.err) {
    const logs = simulation.value.logs ?? []
    throw new TransactionFailedError(explainFailure(logs, 'The transaction would fail on-chain.'), logs)
  }

  onPhase?.('signing')
  if (signers.length > 0) transaction.partialSign(...signers)
  const signed = await wallet.signTransaction(transaction)

  onPhase?.('confirming')
  const signature = await connection.sendRawTransaction(signed.serialize(), { preflightCommitment: 'confirmed' })
  const { value } = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (value.err) {
    const landed = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    const logs = landed?.meta?.logMessages ?? []
    throw new TransactionFailedError(explainFailure(logs, 'The transaction failed on-chain.'), logs)
  }
  return signature
}
