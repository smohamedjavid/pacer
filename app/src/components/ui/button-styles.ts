/** Shared button looks, so links and buttons that do the same job look the same. */
const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gilt'

export const buttonStyles = {
  primary: `${base} h-11 px-6 text-sm bg-gilt text-gilt-ink hover:bg-[#ffc35a]`,
  secondary: `${base} h-11 px-6 text-sm border border-rule-strong text-ivory hover:border-gilt hover:bg-case`,
  quiet: `${base} h-8 px-3 text-xs border border-rule text-fog hover:text-ivory hover:border-rule-strong`,
} as const
