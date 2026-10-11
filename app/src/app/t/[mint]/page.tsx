import { PublicKey } from '@solana/web3.js'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TokenView } from '@/components/token/TokenView'
import { shortAddress } from '@/lib/format'

interface TokenPageProps {
  params: Promise<{ mint: string }>
}

function isAddress(value: string): boolean {
  try {
    return PublicKey.isOnCurve(new PublicKey(value).toBytes()) || true
  } catch {
    return false
  }
}

export async function generateMetadata({ params }: TokenPageProps): Promise<Metadata> {
  const { mint } = await params
  return { title: isAddress(mint) ? `Launch ${shortAddress(mint)}` : 'Unknown token' }
}

export default async function TokenPage({ params }: TokenPageProps) {
  const { mint } = await params
  if (!isAddress(mint)) notFound()
  return <TokenView mint={mint} />
}
