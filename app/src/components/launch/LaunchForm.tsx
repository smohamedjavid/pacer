'use client'

import { buildPacedLaunchTx, getCurveSupply } from '@pacer/sdk'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Keypair } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useId, useState, type ReactNode } from 'react'
import { buttonStyles } from '@/components/ui/button-styles'
import { TxStatus } from '@/components/ui/TxStatus'
import { ConnectWalletButton } from '@/components/wallet/ConnectWalletButton'
import { useTransaction } from '@/hooks/useTransaction'
import { env } from '@/lib/env'
import { formatDuration, formatPercent, formatTokens } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { SchedulePreview } from './SchedulePreview'

const DEFAULT_URI = 'https://raw.githubusercontent.com/smohamedjavid/pacer/main/app/public/token.json'

const PRESETS = [
  { id: '10m', label: '10 min', hint: 'demo', seconds: 600 },
  { id: '1h', label: '1 hour', hint: null, seconds: 3_600 },
  { id: '4h', label: '4 hours', hint: null, seconds: 14_400 },
  { id: '24h', label: '24 hours', hint: null, seconds: 86_400 },
  { id: 'custom', label: 'Custom', hint: null, seconds: null },
] as const
type PresetId = (typeof PRESETS)[number]['id']

const MAX_CUSTOM_MINUTES = 7 * 24 * 60

interface FormValues {
  name: string
  symbol: string
  uri: string
  openingPct: string
  preset: PresetId
  customMinutes: string
  maxPerBuyPct: string
  burstPct: string
}

const INITIAL: FormValues = {
  name: '',
  symbol: '',
  uri: DEFAULT_URI,
  openingPct: '2',
  preset: '10m',
  customMinutes: '90',
  maxPerBuyPct: '6',
  burstPct: '12',
}

type Errors = Partial<Record<keyof FormValues, string>>

function percent(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function validate(v: FormValues) {
  const errors: Errors = {}
  if (!v.name.trim()) errors.name = 'Give the token a name.'
  if (!v.symbol.trim()) errors.symbol = 'Give the token a ticker.'
  if (!/^https?:\/\/\S+$/.test(v.uri.trim())) errors.uri = 'Use a full http(s) link to the metadata JSON.'

  const opening = percent(v.openingPct)
  if (opening === null || opening < 0 || opening > 50) errors.openingPct = 'Between 0 and 50%.'
  const maxPerBuy = percent(v.maxPerBuyPct)
  if (maxPerBuy === null || maxPerBuy < 0 || maxPerBuy > 100)
    errors.maxPerBuyPct = 'Between 0 and 100%. 0 means no cap.'
  const burst = percent(v.burstPct)
  if (burst === null || burst < 0 || burst > 100) errors.burstPct = 'Between 0 and 100%. 0 turns it off.'

  const preset = PRESETS.find((p) => p.id === v.preset)
  const minutes = Number(v.customMinutes)
  let clockSeconds = preset?.seconds ?? null
  if (v.preset === 'custom') {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_CUSTOM_MINUTES) {
      errors.customMinutes = `Whole minutes, 1 to ${MAX_CUSTOM_MINUTES.toLocaleString('en-US')} (7 days).`
    } else {
      clockSeconds = minutes * 60
    }
  }

  const schedule =
    Object.keys(errors).length === 0 && clockSeconds !== null
      ? {
          openingBps: Math.round((opening ?? 0) * 100),
          clockSeconds,
          maxPerBuyBps: Math.round((maxPerBuy ?? 0) * 100),
          burstBps: Math.round((burst ?? 0) * 100),
        }
      : null
  return { errors, schedule, clockSeconds, opening, maxPerBuy, burst }
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}) {
  const id = useId()
  const noteId = `${id}-note`
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ivory">
        {label}
      </label>
      <div className="mt-2">
        {children({ id, describedBy: hint || error ? noteId : undefined, invalid: Boolean(error) })}
      </div>
      {(error || hint) && (
        <p id={noteId} className={`mt-1.5 text-xs leading-relaxed ${error ? 'text-signal' : 'text-fog'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

const inputClass =
  'h-11 w-full rounded-xl border bg-well px-3.5 text-ivory outline-none transition-colors placeholder:text-steel focus:border-gilt aria-[invalid=true]:border-signal/70 border-rule-strong'

function PercentInput({
  id,
  describedBy,
  invalid,
  value,
  onChange,
}: {
  id: string
  describedBy: string | undefined
  invalid: boolean
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={`${inputClass} readout pr-9`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-steel">%</span>
    </div>
  )
}

export function LaunchForm() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const router = useRouter()
  const tx = useTransaction()
  const [values, setValues] = useState<FormValues>(INITIAL)
  const [submitted, setSubmitted] = useState(false)
  const config = env.pacerConfig

  const curveSupply = useQuery({
    queryKey: config ? queryKeys.curveSupply(config) : ['curve-supply', 'none'],
    queryFn: async () => (config ? BigInt((await getCurveSupply(connection, config)).toString()) : null),
    enabled: config !== null,
    staleTime: Infinity,
  })

  const { errors, schedule, clockSeconds, opening, maxPerBuy, burst } = validate(values)
  const shown: Errors = submitted ? errors : {}
  const set =
    <K extends keyof FormValues>(key: K) =>
    (value: FormValues[K]) =>
      setValues((v) => ({ ...v, [key]: value }))
  const supply = curveSupply.data ?? null
  const tokens = (pct: number | null) =>
    supply !== null && pct !== null ? ` (${formatTokens((supply * BigInt(Math.round(pct * 100))) / 10_000n)})` : ''
  const symbol = values.symbol.trim() || 'tokens'

  async function submit() {
    setSubmitted(true)
    if (!schedule || !publicKey || !config) return
    const mint = Keypair.generate()
    const signature = await tx.run(
      async () => {
        const { transaction } = await buildPacedLaunchTx(connection, {
          payer: publicKey,
          creator: publicKey,
          config,
          baseMint: mint.publicKey,
          name: values.name.trim(),
          symbol: values.symbol.trim(),
          uri: values.uri.trim(),
          schedule,
        })
        return { transaction, signers: [mint] }
      },
      { successMessage: 'Launched. The clock is running.', refresh: [queryKeys.launches()] }
    )
    if (signature) router.push(`/t/${mint.publicKey.toBase58()}`)
  }

  if (!config) {
    return (
      <div role="alert" className="rounded-2xl border border-signal/40 bg-case/50 p-6 text-fog">
        Launching is turned off: set <code className="readout text-ivory">NEXT_PUBLIC_PACER_CONFIG</code> to a Pacer DBC
        config address and restart the app.
      </div>
    )
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
    >
      <div className="space-y-8">
        <fieldset className="space-y-5">
          <legend className="font-semibold text-ivory">Token</legend>
          <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
            <Field label="Name" error={shown.name}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  value={values.name}
                  maxLength={32}
                  placeholder="Tidewater Invoice Fund"
                  onChange={(e) => set('name')(e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Ticker" error={shown.symbol}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  value={values.symbol}
                  maxLength={10}
                  placeholder="TIDE"
                  onChange={(e) => set('symbol')(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className={`${inputClass} uppercase`}
                />
              )}
            </Field>
          </div>
          <Field
            label="Metadata URI"
            hint="JSON with name, symbol, description and image. A sample is filled in."
            error={shown.uri}
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                value={values.uri}
                maxLength={200}
                inputMode="url"
                onChange={(e) => set('uri')(e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={`${inputClass} text-sm`}
              />
            )}
          </Field>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="font-semibold text-ivory">Issuance clock</legend>
          <div>
            <p id="clock-label" className="text-sm font-medium text-ivory">
              Release everything over
            </p>
            <div role="radiogroup" aria-labelledby="clock-label" className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {PRESETS.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gilt ${
                    values.preset === p.id
                      ? 'border-gilt bg-gilt/10 text-ivory'
                      : 'border-rule-strong text-fog hover:border-fog'
                  }`}
                >
                  <input
                    type="radio"
                    name="clock-preset"
                    value={p.id}
                    checked={values.preset === p.id}
                    onChange={() => set('preset')(p.id)}
                    className="sr-only"
                  />
                  <span className="font-medium">{p.label}</span>
                  {p.hint && <span className="text-2xs text-steel">{p.hint}</span>}
                </label>
              ))}
            </div>
          </div>
          {values.preset === 'custom' && (
            <Field label="Custom length in minutes" error={errors.customMinutes}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  inputMode="numeric"
                  value={values.customMinutes}
                  onChange={(e) => set('customMinutes')(e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className={`${inputClass} readout sm:w-48`}
                />
              )}
            </Field>
          )}
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Opening tranche" hint={`Released at open${tokens(opening)}.`} error={errors.openingPct}>
              {(p) => <PercentInput {...p} value={values.openingPct} onChange={set('openingPct')} />}
            </Field>
            <Field label="Max per buy" hint={`0 means no cap${tokens(maxPerBuy)}.`} error={errors.maxPerBuyPct}>
              {(p) => <PercentInput {...p} value={values.maxPerBuyPct} onChange={set('maxPerBuyPct')} />}
            </Field>
            <Field label="Burst limit" hint={`0 turns it off${tokens(burst)}.`} error={errors.burstPct}>
              {(p) => <PercentInput {...p} value={values.burstPct} onChange={set('burstPct')} />}
            </Field>
          </div>
          <p className="text-sm leading-relaxed text-fog">
            The burst limit caps how much can be bought in any short window, across all wallets, so supply that piles up
            while nobody buys can&rsquo;t be swept in one block.
          </p>
        </fieldset>

        <div className="space-y-3 border-t border-rule pt-6">
          {publicKey ? (
            <button type="submit" disabled={tx.busy} className={`${buttonStyles.primary} w-full sm:w-auto`}>
              Launch {values.symbol.trim() || 'token'} and start the clock
            </button>
          ) : (
            <ConnectWalletButton className="w-full sm:w-auto">Connect a wallet to launch</ConnectWalletButton>
          )}
          <p className="text-xs text-steel">
            One transaction creates the DBC pool and starts its clock, so there is no gap for a sniper to land in.
          </p>
          <TxStatus state={tx.state} />
        </div>
      </div>

      <aside
        aria-label="Schedule preview"
        className="h-fit rounded-2xl border border-rule bg-case/50 p-5 lg:sticky lg:top-6"
      >
        <h2 className="font-semibold text-ivory">The schedule buyers will see</h2>
        <div className="mt-4">
          <SchedulePreview opening={Math.min(0.5, Math.max(0, (opening ?? 0) / 100))} duration={clockSeconds ?? 600} />
        </div>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-fog">
          <li>
            <span className="text-ivory">{formatPercent((opening ?? 0) / 100)}</span> of the curve opens at launch
            {tokens(opening)}, then the rest is released every second for{' '}
            <span className="text-ivory">{clockSeconds ? formatDuration(clockSeconds) : '—'}</span>.
          </li>
          <li>
            {maxPerBuy ? (
              <>
                One buy takes at most <span className="text-ivory">{formatPercent(maxPerBuy / 100)}</span>
                {tokens(maxPerBuy)} {symbol}.
              </>
            ) : (
              'Single buys are only limited by the clock.'
            )}
          </li>
          <li>
            {burst ? (
              <>
                At most <span className="text-ivory">{formatPercent(burst / 100)}</span>
                {tokens(burst)} can be bought in a burst; it refills at the release rate.
              </>
            ) : (
              'No burst limit: supply that piles up can be bought at once, one capped buy at a time.'
            )}
          </li>
          <li>When the curve fills, it graduates to a compounding DAMM v2 pool with 100% of liquidity locked.</li>
        </ul>
        {curveSupply.isError && <p className="mt-3 text-xs text-signal">Could not read the DBC config from the RPC.</p>}
      </aside>
    </form>
  )
}
