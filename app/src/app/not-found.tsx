import Link from 'next/link'
import { buttonStyles } from '@/components/ui/button-styles'

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <h1 className="font-display text-2xl text-ivory">Nothing on this dial</h1>
      <p className="mt-4 text-fog">
        That page or token address does not exist. Check the link, or browse live launches.
      </p>
      <Link href="/#launches" className={`${buttonStyles.secondary} mt-8`}>
        See live launches
      </Link>
    </section>
  )
}
