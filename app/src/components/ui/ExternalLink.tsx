import type { ReactNode } from 'react'

export function ExternalLink({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ivory hover:decoration-gilt ${className}`}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
