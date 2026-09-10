'use client'

/**
 * The book.
 *
 * Everything here is computed on UNDERLYING prices — the inversion is a lens on
 * the chart and the ticket, never on the ledger. A short that is 70% of the way
 * to its liquidation level has to be impossible to miss, so proximity drives the
 * row tint, the meter tone and the ink colour all at once.
 */

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Meter, Pill } from '@/components/ui/primitives'
import { useStore } from '@/lib/store'
import { getAsset } from '@/lib/assets'
import {
  borrowOver,
  fundingOver,
  liquidationProximity,
  notional,
  roe,
  unrealizedPnl,
} from '@/lib/inversion'
import { abbr, price as fmtPrice, pct, signedRate, signedUsd, usd, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'

const COLS =
  'grid grid-cols-[88px_96px_88px_84px_84px_108px_100px_76px_82px_92px_30px] items-center gap-x-2 px-3'

/** Wall clock, resolved after mount so the first paint matches the server. */
function useNowSeconds(stepMs = 15_000) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const read = () => setNow(Math.floor(Date.now() / 1000))
    read()
    const id = setInterval(read, stepMs)
    return () => clearInterval(id)
  }, [stepMs])
  return now
}

function liqTone(proximity: number): 'accent' | 'warn' | 'short' {
  if (proximity > 0.7) return 'short'
  if (proximity > 0.45) return 'warn'
  return 'accent'
}

export function PositionsTable({
  markPrices,
  symbol,
}: {
  markPrices: Record<string, number>
  symbol?: string
}) {
  const all = useStore((s) => s.positions)
  const closePosition = useStore((s) => s.closePosition)
  const now = useNowSeconds()

  const positions = symbol ? all.filter((p) => p.symbol === symbol) : all

  if (positions.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 px-6 text-center">
        <span className="text-xs text-ink-3">
          {symbol ? `No open position in ${symbol}.` : 'No open positions.'}
        </span>
        <span className="text-mini text-ink-4">
          Pick a direction on the ticket and your fill lands here with live PnL, carry and a
          liquidation gauge.
        </span>
      </div>
    )
  }

  return (
    <div className="min-w-[940px]">
      <div
        className={cn(
          COLS,
          'sticky top-0 z-10 h-[var(--head-h)] border-b border-line bg-surface',
          'text-micro font-semibold uppercase tracking-[0.09em] text-ink-4',
        )}
      >
        <span>Side</span>
        <span>Symbol</span>
        <span className="text-right">Size</span>
        <span className="text-right">Entry</span>
        <span className="text-right">Mark</span>
        <span className="text-right">Liq</span>
        <span className="text-right">PnL</span>
        <span className="text-right">ROE</span>
        <span className="text-right">Margin</span>
        <span className="text-right">Funding</span>
        <span />
      </div>

      {positions.map((p) => {
        const asset = getAsset(p.symbol)
        const mark = markPrices[p.symbol] ?? asset?.price ?? p.entry
        const pnl = unrealizedPnl(p.side, p.entry, mark, p.size)
        const returnOnEquity = roe(p.side, p.entry, mark, p.size, p.margin)
        const proximity = liquidationProximity(p.side, p.entry, mark, p.liquidation)
        const exposure = notional(p.size, mark)
        const hours = now > 0 ? Math.max(now - p.openedAt, 0) / 3600 : 0
        const carry =
          fundingOver(p.side, asset?.fundingRate ?? 0, exposure, hours) +
          borrowOver(p.side, asset?.borrowFee ?? 0, exposure, hours)
        const tone = liqTone(proximity)

        return (
          <div
            key={p.id}
            className={cn(
              COLS,
              'h-[var(--row-h)] border-b border-line/60 transition-colors hover:bg-raised',
              proximity > 0.7 && 'bg-short/[0.06]',
            )}
          >
            <Pill tone={p.side}>
              {p.side === 'short' ? 'SHORT' : 'LONG'}
              <span className="num">{p.leverage}x</span>
            </Pill>

            <span className="truncate text-xs font-semibold text-ink">{p.symbol}</span>

            <span className="flex flex-col items-end leading-tight">
              <span className="num text-mini text-ink">{abbr(p.size)}</span>
              <span className="num text-micro text-ink-4">{usdAbbr(exposure)}</span>
            </span>

            <span className="num text-right text-mini text-ink-2">{fmtPrice(p.entry)}</span>
            <span className="num text-right text-mini text-ink">{fmtPrice(mark)}</span>

            <span className="flex flex-col items-end gap-[3px]">
              <span
                className={cn(
                  'num text-mini',
                  proximity > 0.7 ? 'font-semibold text-short' : 'text-ink-2',
                )}
              >
                {fmtPrice(p.liquidation)}
              </span>
              <Meter value={proximity} tone={tone} className="w-full" />
            </span>

            <span
              className={cn(
                'num text-right text-mini font-semibold',
                pnl < 0 ? 'text-short' : 'text-long',
              )}
            >
              {signedUsd(pnl)}
            </span>

            <span
              className={cn(
                'num text-right text-mini',
                returnOnEquity < 0 ? 'text-short' : 'text-long',
              )}
            >
              {pct(returnOnEquity * 100)}
            </span>

            <span className="num text-right text-mini text-ink-2">{usd(p.margin)}</span>

            <span className="flex flex-col items-end leading-tight">
              <span className={cn('num text-mini', carry < 0 ? 'text-short' : 'text-long')}>
                {signedUsd(carry)}
              </span>
              <span className="num text-micro text-ink-4">
                {signedRate(asset?.fundingRate ?? 0, 3)}/8h
              </span>
            </span>

            <button
              onClick={() => closePosition(p.id, mark)}
              aria-label={`Close ${p.side} position in ${p.symbol}`}
              title="Close at mark"
              className="grid size-[22px] place-items-center rounded-[3px] border border-line bg-sunken text-ink-3 transition-colors hover:border-short/40 hover:bg-short/10 hover:text-short"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
