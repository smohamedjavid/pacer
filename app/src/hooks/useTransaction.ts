'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import type { Keypair, Transaction } from '@solana/web3.js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { describeError } from '@/lib/errors'
import { sendWithWallet, type SendPhase } from '@/lib/transactions'

export type TransactionState =
  | { status: 'idle' }
  | { status: 'pending'; phase: 'building' | SendPhase }
  | { status: 'success'; signature: string; message: string }
  | { status: 'error'; message: string }

export interface PreparedTransaction {
  transaction: Transaction
  signers?: Keypair[]
}

export const PHASE_COPY: Record<'building' | SendPhase, string> = {
  building: 'Building transaction…',
  simulating: 'Checking against the clock…',
  signing: 'Approve in your wallet…',
  confirming: 'Confirming on-chain…',
}

/**
 * Runs one wallet transaction at a time: build, simulate, sign, confirm, then refresh the given
 * queries. Failures are turned into one readable sentence (Pacer's revert reason when there is one).
 */
export function useTransaction() {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const queryClient = useQueryClient()
  const [state, setState] = useState<TransactionState>({ status: 'idle' })

  const run = useCallback(
    async (
      build: () => Promise<PreparedTransaction>,
      { successMessage, refresh = [] }: { successMessage: string; refresh?: ReadonlyArray<readonly unknown[]> }
    ): Promise<string | null> => {
      if (!publicKey || !signTransaction) {
        setState({ status: 'error', message: 'Connect a wallet first.' })
        return null
      }
      try {
        setState({ status: 'pending', phase: 'building' })
        const { transaction, signers } = await build()
        const signature = await sendWithWallet({
          connection,
          wallet: { publicKey, signTransaction },
          transaction,
          signers,
          onPhase: (phase) => setState({ status: 'pending', phase }),
        })
        setState({ status: 'success', signature, message: successMessage })
        await Promise.all(refresh.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
        return signature
      } catch (error) {
        setState({ status: 'error', message: describeError(error) })
        return null
      }
    },
    [connection, publicKey, signTransaction, queryClient]
  )

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, run, reset, busy: state.status === 'pending' }
}
