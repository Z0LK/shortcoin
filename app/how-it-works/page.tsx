import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { InversionDemo } from '@/components/explainer/inversion-demo'
import {
  Hero,
  LiquidationBackwards,
  Simulation,
  TheInversion,
  WhatItCosts,
  WhyYouCannotShort,
} from '@/components/explainer/explainer-sections'

export const metadata = {
  title: 'How shorting works — SHORTCOIN',
  description:
    'The mechanism behind SHORTCOIN: how a price series is inverted into a synthetic short instrument, what it costs to hold, and why liquidation runs the other way.',
}

export default function HowItWorksPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-6 pb-24">
        <Hero />
        <InversionDemo />
        <WhyYouCannotShort />
        <TheInversion />
        <WhatItCosts />
        <LiquidationBackwards />
        <Simulation />

        <div className="border-t border-line py-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-[5px] bg-accent px-4 py-2.5 text-xs font-semibold text-accent-ink transition-[filter] hover:brightness-110"
          >
            Open the scanner <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  )
}
