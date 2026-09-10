'use client'

/**
 * Net exposure at a glance.
 *
 * The one question this screen has to answer before any other: am I net long or
 * net short, and where. Gross notional splits the top bar; the sector strip
 * underneath is weighted by gross and coloured by each sector's NET direction,
 * with opacity standing in for conviction — a sector that is half long and half
 * short is washed out, a one-way bet is solid.
 */

import { useMemo } from 'react'
import { getAsset } from '@/lib/assets'
import { notional } from '@/lib/inversion'
import { clamp01, rate, usdAbbr, signedUsd } from '@/lib/format'
import { Label } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { Position, Sector } from '@/lib/types'

interface Bucket {
  sector: Sector
  long: number
  short: number
  gross: number
}

export function ExposureBar({
  positions,
  markPrices,
}: {
  positions: Position[]
  markPrices: Record<string, number>
}) {
  const book = useMemo(() => {
    let long = 0
    let short = 0
    const bySector = new Map<Sector, Bucket>()

    for (const p of positions) {
      // Marks lag a fresh position by one tick; entry is the honest fallback.
      const mark = markPrices[p.symbol] ?? p.entry
      const value = notional(p.size, mark)
      if (p.side === 'long') long += value
      else short += value

      const sector = getAsset(p.symbol)?.sector ?? 'Technology'
      const b = bySector.get(sector) ?? { sector, long: 0, short: 0, gross: 0 }
      if (p.side === 'long') b.long += value
      else b.short += value
      b.gross += value
      bySector.set(sector, b)
    }

    const gross = long + short
    return {
      long,
      short,
      gross,
      net: long - short,
      sectors: [...bySector.values()].sort((a, b) => b.gross - a.gross),
    }
  }, [positions, markPrices])

  const empty = book.gross <= 0
  const longShare = empty ? 0 : book.long / book.gross
  const netLong = book.net >= 0
  const tilt = empty ? 0 : Math.abs(book.net) / book.gross

  return (
    <section className="flex flex-col border border-line bg-surface">
      <header className="flex h-[var(--head-h)] shrink-0 items-center justify-between border-b border-line px-3">
        <Label>Exposure</Label>
        <span className="num text-micro text-ink-3">
          {positions.length} position{positions.length === 1 ? '' : 's'} · gross{' '}
          <span className="text-ink-2">{usdAbbr(book.gross)}</span>
        </span>
      </header>

      <div className="flex flex-col gap-2.5 px-3 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-micro font-bold uppercase tracking-[0.09em]',
                empty ? 'text-ink-4' : netLong ? 'text-long' : 'text-short',
              )}
            >
              {empty ? 'Flat' : netLong ? 'Net long' : 'Net short'}
            </span>
            <span
              className={cn(
                'num text-lg font-semibold',
                empty ? 'text-ink-3' : netLong ? 'text-long' : 'text-short',
              )}
            >
              {signedUsd(book.net)}
            </span>
            {!empty && (
              <span className="num text-micro text-ink-4">{rate(tilt, 0)} of gross</span>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <span className="num text-mini text-ink-3">
              <span className="text-long">L</span> {usdAbbr(book.long)}
            </span>
            <span className="num text-mini text-ink-3">
              <span className="text-short">S</span> {usdAbbr(book.short)}
            </span>
          </div>
        </div>

        {empty ? (
          <>
            <div className="h-[14px] w-full rounded-[3px] border border-line bg-sunken" />
            <p className="text-mini text-ink-3">
              No exposure. Open a position and this bar splits your book into long and short notional.
            </p>
          </>
        ) : (
          <>
            <div
              className="flex h-[14px] w-full overflow-hidden rounded-[3px] bg-sunken"
              role="img"
              aria-label={`Gross exposure ${usdAbbr(book.gross)}: ${rate(longShare, 0)} long, ${rate(1 - longShare, 0)} short`}
            >
              {book.long > 0 && (
                <div
                  className="flex items-center justify-start overflow-hidden bg-long pl-1.5"
                  style={{ width: `${clamp01(longShare) * 100}%` }}
                >
                  {longShare > 0.14 && (
                    <span className="num text-micro font-bold text-void">
                      {rate(longShare, 0)} LONG
                    </span>
                  )}
                </div>
              )}
              {book.short > 0 && (
                <div
                  className="flex items-center justify-end overflow-hidden bg-short pr-1.5"
                  style={{ width: `${clamp01(1 - longShare) * 100}%` }}
                >
                  {1 - longShare > 0.14 && (
                    <span className="num text-micro font-bold text-void">
                      SHORT {rate(1 - longShare, 0)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
              <Label>By sector</Label>

              <div className="flex h-[6px] w-full gap-px overflow-hidden rounded-[3px] bg-sunken">
                {book.sectors.map((s) => {
                  const net = s.long - s.short
                  const conviction = s.gross > 0 ? Math.abs(net) / s.gross : 0
                  return (
                    <div
                      key={s.sector}
                      className={cn('h-full', net >= 0 ? 'bg-long' : 'bg-short')}
                      style={{
                        width: `${(s.gross / book.gross) * 100}%`,
                        opacity: 0.35 + clamp01(conviction) * 0.65,
                      }}
                      title={`${s.sector} — ${usdAbbr(s.gross)} gross`}
                    />
                  )
                })}
              </div>

              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1 sm:grid-cols-3">
                {book.sectors.map((s) => {
                  const net = s.long - s.short
                  const conviction = s.gross > 0 ? Math.abs(net) / s.gross : 0
                  return (
                    <li key={s.sector} className="flex items-center gap-1.5 py-0.5">
                      <span
                        aria-hidden
                        className={cn(
                          'size-[7px] shrink-0 rounded-[2px]',
                          net >= 0 ? 'bg-long' : 'bg-short',
                        )}
                        style={{ opacity: 0.35 + clamp01(conviction) * 0.65 }}
                      />
                      <span className="truncate text-mini text-ink-2">{s.sector}</span>
                      <span className="num ml-auto text-mini text-ink-3">
                        {rate(s.gross / book.gross, 0)}
                      </span>
                      <span
                        className={cn(
                          'num w-[68px] text-right text-mini',
                          net >= 0 ? 'text-long' : 'text-short',
                        )}
                      >
                        {signedUsd(net)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
