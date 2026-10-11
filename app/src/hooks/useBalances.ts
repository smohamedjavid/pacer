'use client'

import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, unpackAccount } from '@solana/spl-token'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import type { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { env } from '@/lib/env'
import { queryKeys } from '@/lib/query-keys'

export interface Balances {
  lamports: bigint
  tokens: bigint
}

/** The connected wallet's SOL and launch-token balances, read in one RPC call. */
export function useBalances(mint: PublicKey) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  return useQuery({
    queryKey: queryKeys.balances(mint, publicKey),
    enabled: publicKey !== null,
    refetchInterval: env.poll.balances,
    queryFn: async (): Promise<Balances> => {
      if (!publicKey) return { lamports: 0n, tokens: 0n }
      const ata = getAssociatedTokenAddressSync(mint, publicKey, false, TOKEN_2022_PROGRAM_ID)
      const [wallet, tokenAccount] = await connection.getMultipleAccountsInfo([publicKey, ata])
      return {
        lamports: BigInt(wallet?.lamports ?? 0),
        tokens: tokenAccount ? unpackAccount(ata, tokenAccount, TOKEN_2022_PROGRAM_ID).amount : 0n,
      }
    },
  })
}
