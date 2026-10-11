'use client'

import { useConnection } from '@solana/wallet-adapter-react'
import type { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { env } from '@/lib/env'
import { LegacyLaunchError, fetchLaunch } from '@/lib/launch'
import { queryKeys } from '@/lib/query-keys'

export function useLaunch(mint: PublicKey) {
  const { connection } = useConnection()
  return useQuery({
    queryKey: queryKeys.launch(mint),
    queryFn: () => fetchLaunch(connection, mint),
    retry: (failures, error) => !(error instanceof LegacyLaunchError) && failures < 3,
    refetchInterval: (query) => (query.state.data?.market.isMigrated ? 30_000 : env.poll.launch),
  })
}
