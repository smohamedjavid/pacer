import { useId, type ReactNode } from 'react'

interface AmountFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  unit: string
  /** Button(s) next to the label, e.g. "Max available". */
  action?: ReactNode
  /** Helper or validation text under the field. */
  hint?: ReactNode
  invalid?: boolean
  disabled?: boolean
}

export function AmountField({
  label,
  value,
  onChange,
  unit,
  action,
  hint,
  invalid = false,
  disabled,
}: AmountFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm text-fog">
          {label}
        </label>
        {action}
      </div>
      <div
        className={`mt-2 flex items-center rounded-xl border bg-well px-4 transition-colors focus-within:border-gilt ${invalid ? 'border-signal/70' : 'border-rule-strong'}`}
      >
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0"
          value={value}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="readout h-12 w-full min-w-0 bg-transparent text-lg text-ivory outline-none placeholder:text-steel disabled:opacity-50"
        />
        <span className="ml-3 shrink-0 text-sm text-steel">{unit}</span>
      </div>
      {hint && (
        <div id={hintId} className={`mt-2 text-xs leading-relaxed ${invalid ? 'text-signal' : 'text-fog'}`}>
          {hint}
        </div>
      )}
    </div>
  )
}
