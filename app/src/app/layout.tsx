import type { Metadata, Viewport } from 'next'
import { Instrument_Sans, Martian_Mono, Michroma } from 'next/font/google'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { AppProviders } from '@/components/providers/AppProviders'
import './globals.css'

const michroma = Michroma({ weight: '400', subsets: ['latin'], variable: '--font-michroma', display: 'swap' })
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument', display: 'swap' })
const martian = Martian_Mono({ subsets: ['latin'], variable: '--font-martian', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Pacer — scheduled token offerings on Meteora', template: '%s · Pacer' },
  description:
    'An issuance clock for Meteora Dynamic Bonding Curve launches. Supply is released on a published schedule, so no one can buy the curve in a single block.',
}

export const viewport: Viewport = {
  themeColor: '#0b1b2e',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${michroma.variable} ${instrument.variable} ${martian.variable}`}>
      <body>
        <AppProviders>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  )
}
