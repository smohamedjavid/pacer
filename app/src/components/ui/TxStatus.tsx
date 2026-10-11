import { PHASE_COPY, type TransactionState } from '@/hooks/useTransaction'
import { explorerTxUrl } from '@/lib/explorer'
import { ExternalLink } from './ExternalLink'

/** Live status line for the current wallet transaction. */
export function TxStatus({ state }: { state: TransactionState }) {
  return (
    <div aria-live="polite" className="min-h-5 text-sm">
      {state.status === 'pending' && <p className="text-fog">{PHASE_COPY[state.phase]}</p>}
      {state.status === 'success' && (
        <p className="text-verdigris">
          {state.message}{' '}
          <ExternalLink href={explorerTxUrl(state.signature)} className="text-fog">
            View transaction
          </ExternalLink>
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="text-signal">
          {state.message}
        </p>
      )}
    </div>
  )
}
