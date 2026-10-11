'use client'

import dynamic from 'next/dynamic'

const LABELS = {
  'change-wallet': 'Change wallet',
  connecting: 'Connecting…',
  'copy-address': 'Copy address',
  copied: 'Copied',
  disconnect: 'Disconnect',
  'has-wallet': 'Connect',
  'no-wallet': 'Connect wallet',
} as const

/** The wallet adapter button reads browser-only wallet state, so it renders on the client only. */
export const WalletButton = dynamic(
  async () => {
    const { BaseWalletMultiButton } = await import('@solana/wallet-adapter-react-ui')
    return function WalletButton() {
      return <BaseWalletMultiButton labels={LABELS} />
    }
  },
  {
    ssr: false,
    loading: () => <span aria-hidden className="inline-block h-10 w-36 rounded-full border border-rule-strong" />,
  }
)
