'use client'

/**
 * The print tape.
 *
 * Seeded from `generateTrades` inside an effect — it reads the wall clock, so it
 * can never run during render — then kept alive by the tick stream. New prints
 * mount at the top and play the flash animation exactly once, which is what
 * makes a tape read as a feed rather than as a table that occasionally changes.
 */

import { useEffect, useRef, useState } from 'react'
import { Pill } from '@/components/ui/primitives'
import { useTickHandler } from '@/components/market-provider'
import { generateTrades, fakeWallet } from '@/lib/sim'
import { rng } from '@/lib/rng'
import { abbr, clockTime, price as fmtPrice, shortAddress, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset, Trade } from '@/lib/types'

const MAX_ROWS = 80

const COLS =
  'grid grid-cols-[74px_52px_minmax(78px,1fr)_minmax(70px,1fr)_minmax(70px,1fr)_146px] items-center gap-x-2 px-3'

const TAG_TONE: Record<NonNullable<Trade['tag']>, 'warn' | 'info' | 'neutral' | 'accent'> = {
  whale: 'warn',
  smart: 'info',
  fresh: 'neutral',
  you: 'accent',
}

/** Rows added after mount animate; the seeded batch must not. */
interface TapeRow extends Trade {
  live?: boolean
}

export function TradeTape({ asset }: { asset: Asset }) {
  const [rows, setRows] = useState<TapeRow[]>([])
  const seq = useRef(0)
  const random = useRef<(() => number) | null>(null)

  useEffect(() => {
    setRows(generateTrades(asset, 60))
    seq.current = 0
    random.current = rng(`${asset.symbol}:tape:live`)
  }, [asset])

  useTickHandler(asset.symbol, (t) => {
    const next = random.current
    // Not every engine tick is a print, otherwise the tape scrolls at a rate no
    // human can read and every row looks identical in size.
    if (!next || next() > 0.45) return

    seq.current += 1
    const r = next()
    const print: TapeRow = {
      id: `${asset.symbol}-live-${seq.current}`,
      symbol: asset.symbol,
      side: next() > 0.48 ? 'long' : 'short',
      price: t.price * (1 + (next() - 0.5) * 0.0025),
      size: (asset.volume24h / 8640) * (0.15 + next() * 5.5),
      time: Math.floor(Date.now() / 1000),
      wallet: fakeWallet(next),
      tag: r > 0.95 ? 'whale' : r > 0.87 ? 'smart' : r > 0.8 ? 'fresh' : undefined,
      live: true,
    }
    setRows((prev) => [print, ...prev].slice(0, MAX_ROWS))
  })

  return (
    <div>
      <div
        className={cn(
          COLS,
          'sticky top-0 z-10 h-[var(--head-h)] border-b border-line bg-surface',
          'text-micro font-semibold uppercase tracking-[0.09em] text-ink-4',
        )}
      >
        <span>Time</span>
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Value</span>
        <span className="text-right">Wallet</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-ink-3">
          Subscribing to the {asset.symbol} print stream…
        </div>
      ) : (
        rows.map((t) => (
          <div
            key={t.id}
            className={cn(
              COLS,
              'h-[var(--row-h-tight)] border-b border-line/40 hover:bg-raised',
              t.live && (t.side === 'long' ? 'flash-up' : 'flash-down'),
            )}
          >
            <span className="num text-mini text-ink-3">{clockTime(t.time)}</span>
            <span
              className={cn(
                'text-micro font-bold tracking-[0.06em]',
                t.side === 'long' ? 'text-long' : 'text-short',
              )}
            >
              {t.side === 'long' ? 'BUY' : 'SELL'}
            </span>
            <span
              className={cn(
                'num text-right text-mini font-medium',
                t.side === 'long' ? 'text-long' : 'text-short',
              )}
            >
              {fmtPrice(t.price)}
            </span>
            <span className="num text-right text-mini text-ink-2">{abbr(t.size)}</span>
            <span className="num text-right text-mini text-ink">{usdAbbr(t.size * t.price)}</span>
            <span className="flex items-center justify-end gap-1.5">
              {t.tag && (
                <Pill tone={TAG_TONE[t.tag]} className="uppercase">
                  {t.tag}
                </Pill>
              )}
              <span className="num text-mini text-ink-3">{shortAddress(t.wallet)}</span>
            </span>
          </div>
        ))
      )}
    </div>
  )
}
