'use client'

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { env } from '@/lib/env'
import '@solana/wallet-adapter-react-ui/styles.css'

/**
 * Query cache, RPC connection and wallets. Wallets are discovered through the Wallet Standard
 * (Phantom, Solflare, Backpack, ...), so no adapters are bundled.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 3,
            retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 15_000),
          },
        },
      })
  )
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={env.rpcUrl} config={{ commitment: 'confirmed' }}>
        <WalletProvider wallets={[]} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  )
}
