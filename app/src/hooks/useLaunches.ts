'use client'

import { useConnection } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { fetchLaunches } from '@/lib/launch'
import { env } from '@/lib/env'
import { queryKeys } from '@/lib/query-keys'

export function useLaunches() {
  const { connection } = useConnection()
  return useQuery({
    queryKey: queryKeys.launches(),
    queryFn: () => fetchLaunches(connection),
    refetchInterval: env.poll.launches,
  })
}
