'use client'

import { useConnection } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

// One shared one-second ticker for every live readout on the page.
const listeners = new Set<() => void>()
let tick = 0
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!timer) {
    timer = setInterval(() => {
      tick += 1
      listeners.forEach((l) => l())
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const SERVER_TICK = -1
const getTick = () => tick
const getServerTick = () => SERVER_TICK

/**
 * The validator's unix time, ticking once per second.
 * The issuance clock runs on chain time, which can drift from this device's clock, so the
 * offset is measured from the latest block and refreshed every minute.
 *
 * Returns 0 during server rendering and hydration, so time-dependent markup matches on both sides.
 */
export function useChainClock(): number {
  const { connection } = useConnection()
  const { data: offset = 0 } = useQuery({
    queryKey: ['chain-clock-offset', connection.rpcEndpoint],
    queryFn: async () => {
      const slot = await connection.getSlot('confirmed')
      const blockTime = await connection.getBlockTime(slot)
      return blockTime === null ? 0 : blockTime - Date.now() / 1000
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const current = useSyncExternalStore(subscribe, getTick, getServerTick)
  return current === SERVER_TICK ? 0 : Math.floor(Date.now() / 1000 + offset)
}
