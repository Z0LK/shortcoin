'use client'

/**
 * The tape.
 *
 * Purely atmospheric, and it earns its 28px: a terminal that is silent when you
 * are not looking at a chart does not feel connected to anything. Rendered from
 * seed values on the server, then wired to live ticks after mount.
 */

import { memo } from 'react'
import Link from 'next/link'
import { ASSETS } from '@/lib/assets'
import { useLivePrice } from '@/components/market-provider'
import { pct, price } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset } from '@/lib/types'

const TAPE = ASSETS.slice(0, 26)

const TapeItem = memo(function TapeItem({ asset }: { asset: Asset }) {
  const live = useLivePrice(asset)
  const up = asset.change24h >= 0
  return (
    <Link
      href={`/t/${asset.symbol}`}
      className="flex shrink-0 items-center gap-2 px-3 transition-colors hover:bg-raised"
    >
      <i aria-hidden className="spectrum-dot" />
      <span className="mono text-[10px] text-ink-2">{asset.symbol}</span>
      <span
        key={live.seq}
        className={cn(
          'num text-mini text-ink',
          live.dir > 0 && 'text-long',
          live.dir < 0 && 'text-short',
        )}
      >
        {price(live.price)}
      </span>
      <span className={cn('num text-mini', up ? 'text-long' : 'text-short')}>
        {pct(asset.change24h, 1)}
      </span>
    </Link>
  )
})

export function TickerTape() {
  return (
    <div className="relative flex h-9 shrink-0 items-center overflow-hidden border-b border-line bg-white/[0.012]">
      <div className="marquee flex w-max items-center">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {TAPE.map((a) => (
              <TapeItem key={`${copy}-${a.symbol}`} asset={a} />
            ))}
          </div>
        ))}
      </div>
      {/* fade the ends so the loop seam never shows */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[var(--void)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[var(--void)] to-transparent" />
    </div>
  )
}
