import { PACER_PROGRAM_ID } from '@pacer/sdk'
import { explorerAddressUrl } from '@/lib/explorer'

export function SiteFooter() {
  const programId = PACER_PROGRAM_ID.toBase58()
  return (
    <footer className="mt-24 border-t border-rule/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-steel sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Pacer is a Token-2022 transfer hook for Meteora Dynamic Bonding Curve launches.</p>
        <a
          href={explorerAddressUrl(programId)}
          target="_blank"
          rel="noreferrer"
          className="readout text-xs text-fog underline decoration-rule-strong underline-offset-4 hover:text-ivory"
        >
          Program {programId.slice(0, 4)}…{programId.slice(-4)}
        </a>
      </div>
    </footer>
  )
}
