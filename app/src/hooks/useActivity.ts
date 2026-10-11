'use client'

import { fetchPaceActivity, type PaceActivity } from '@pacer/sdk'
import { useConnection } from '@solana/wallet-adapter-react'
import type { PublicKey } from '@solana/web3.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { env } from '@/lib/env'
import { queryKeys } from '@/lib/query-keys'

const HISTORY_LIMIT = 1000

/**
 * Paced buys, sells and rejections for a launch, newest first.
 * The first load reads the full history; later polls only fetch signatures newer than the newest seen.
 */
export function useActivity(mint: PublicKey, { live }: { live: boolean }) {
  const { connection } = useConnection()
  const queryClient = useQueryClient()
  const key = queryKeys.activity(mint)
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<PaceActivity[]> => {
      const known = queryClient.getQueryData<PaceActivity[]>(key)
      const newest = known?.[0]?.signature
      if (!known || !newest) return fetchPaceActivity(connection, mint, { limit: HISTORY_LIMIT })
      const fresh = await fetchPaceActivity(connection, mint, { until: newest, limit: HISTORY_LIMIT })
      return fresh.length === 0 ? known : [...fresh, ...known]
    },
    refetchInterval: live ? env.poll.activity : 60_000,
  })
}
