import { Hero } from '@/components/home/Hero'
import { HowItWorks } from '@/components/home/HowItWorks'
import { LaunchBoard } from '@/components/home/LaunchBoard'
import { WhyPacing } from '@/components/home/WhyPacing'

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <WhyPacing />
      <LaunchBoard />
    </>
  )
}
