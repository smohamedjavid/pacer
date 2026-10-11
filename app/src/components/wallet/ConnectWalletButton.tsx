'use client'

import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { buttonStyles } from '@/components/ui/button-styles'

/** Opens the wallet picker. Used in place of an action button while no wallet is connected. */
export function ConnectWalletButton({
  children = 'Connect wallet',
  className = '',
}: {
  children?: string
  className?: string
}) {
  const { setVisible } = useWalletModal()
  return (
    <button type="button" onClick={() => setVisible(true)} className={`${buttonStyles.primary} ${className}`}>
      {children}
    </button>
  )
}
