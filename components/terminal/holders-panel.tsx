'use client'

/**
 * Holder distribution.
 *
 * Derived from one seeded stream per symbol, so the same token always shows the
 * same cap table. The weights decay geometrically rather than being drawn
 * independently: a real token's top holder owns several times what the tenth
 * does, and uniform noise reads as fake the moment you scan the column.
 */

import { useMemo } from 'react'
import { Label, Meter, Pill, Stat } from '@/components/ui/primitives'
import { fakeWallet } from '@/lib/sim'
import { between, rng } from '@/lib/rng'
import { abbr, rate, shortAddress, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset, Holder } from '@/lib/types'

const TOP_N = 20

const COLS =
  'grid grid-cols-[22px_minmax(136px,1fr)_66px_minmax(70px,110px)_84px] items-center gap-x-2 px-3'

const TAG_LABEL: Record<NonNullable<Holder['tag']>, string> = {
  treasury: 'TREASURY',
  'market-maker': 'MM',
  whale: 'WHALE',
  you: 'YOU',
}

const TAG_TONE: Record<NonNullable<Holder['tag']>, 'info' | 'warn' | 'neutral' | 'accent'> = {
  treasury: 'info',
  'market-maker': 'neutral',
  whale: 'warn',
  you: 'accent',
}

/** `pct` is a FRACTION of supply (0.084 = 8.4%), matching `rate()`. */
function buildHolders(asset: Asset): Holder[] {
  const next = rng(`${asset.symbol}:holders`)
  const mmIndex = 1 + Math.floor(next() * 3)

  const out: Holder[] = []
  let weight = between(next, 0.055, 0.115)

  for (let i = 0; i < TOP_N; i++) {
    const tag: Holder['tag'] =
      i === 0 ? 'treasury' : i === mmIndex ? 'market-maker' : weight > 0.02 ? 'whale' : undefined
    out.push({
      wallet: fakeWallet(next),
      pct: weight,
      value: weight * asset.marketCap,
      tag,
    })
    weight *= between(next, 0.72, 0.95)
  }
  return out
}

export function HoldersPanel({ asset }: { asset: Asset }) {
  const holders = useMemo(() => buildHolders(asset), [asset])
  const top10 = holders.slice(0, 10).reduce((s, h) => s + h.pct, 0)
  const max = holders[0]?.pct ?? 1

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 border-b border-line px-3 py-2.5">
        <Stat
          label="Top 10 concentration"
          value={rate(top10)}
          tone={top10 > 0.5 ? 'warn' : undefined}
          hint="of circulating supply"
        />
        <Stat label="Holders" value={abbr(asset.holders)} hint={`wallets on ${asset.symbol}`} />
        <Stat
          label="Short interest"
          value={rate(asset.shortInterest)}
          tone={asset.shortInterest > 0.4 ? 'short' : undefined}
          hint="of open interest"
        />
      </div>

      <div
        className={cn(
          COLS,
          'sticky top-0 z-10 h-[var(--head-h)] border-b border-line bg-surface',
          'text-micro font-semibold uppercase tracking-[0.09em] text-ink-4',
        )}
      >
        <span>#</span>
        <span>Wallet</span>
        <span className="text-right">Supply</span>
        <Label className="pl-2">Distribution</Label>
        <span className="text-right">Value</span>
      </div>

      {holders.map((h, i) => (
        <div
          key={h.wallet}
          className={cn(COLS, 'h-[var(--row-h-tight)] border-b border-line/40 hover:bg-raised')}
        >
          <span className="num text-micro text-ink-4">{i + 1}</span>
          <span className="flex items-center gap-1.5 overflow-hidden">
            <span className="num truncate text-mini text-ink-2">{shortAddress(h.wallet, 6, 6)}</span>
            {h.tag && <Pill tone={TAG_TONE[h.tag]}>{TAG_LABEL[h.tag]}</Pill>}
          </span>
          <span className="num text-right text-mini text-ink">{rate(h.pct)}</span>
          <span className="pl-2">
            <Meter value={h.pct / max} tone="accent" />
          </span>
          <span className="num text-right text-mini text-ink-2">{usdAbbr(h.value)}</span>
        </div>
      ))}
    </div>
  )
}
