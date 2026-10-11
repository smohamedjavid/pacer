'use client'

import type { PublicKey } from '@solana/web3.js'
import { useState } from 'react'
import { shortAddress } from '@/lib/format'

/** A short address that copies the full one on click. */
export function CopyAddress({ address, label }: { address: PublicKey | string; label: string }) {
  const [copied, setCopied] = useState(false)
  const full = address.toString()
  async function copy() {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={full}
      aria-label={`Copy ${label} ${full}`}
      className="readout inline-flex items-center gap-1.5 rounded-md text-xs text-fog transition-colors hover:text-ivory"
    >
      {shortAddress(full)}
      <span aria-live="polite" className={copied ? 'text-verdigris' : 'text-steel'}>
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  )
}
