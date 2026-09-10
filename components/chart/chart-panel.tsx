'use client'

/**
 * Chart panel: the instrument header, the interval strip, the OHLC readout and
 * the canvas.
 *
 * The header's job is to make the answer to "what am I looking at?" impossible
 * to get wrong. The series is always the inverse, so the strip is permanently
 * badged and the underlying is kept on screen beside it — the two prices are
 * close together on a fresh anchor and must never be mistaken for each other.
 */

import { useEffect, useRef, useState } from 'react'
import { Repeat2, TrendingDown, TrendingUp } from 'lucide-react'
import { PriceChart } from '@/components/chart/price-chart'
import { Pill } from '@/components/ui/primitives'
import { useLivePrice } from '@/components/market-provider'
import { useStore } from '@/lib/store'
import { INTERVALS, type Interval } from '@/lib/sim'
import { invertPrice } from '@/lib/inversion'
import { abbr, pct, price as fmtPrice, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset, Candle } from '@/lib/types'

export function ChartPanel({
  asset,
  onMark,
}: {
  asset: Asset
  /** Reports the live UNDERLYING mark upward, so the ticket prices off truth. */
  onMark?: (p: number) => void
}) {
  const [interval, setIntervalValue] = useState<Interval>('5m')
  const [hover, setHover] = useState<Candle | null>(null)
  const [last, setLast] = useState<Candle | null>(null)

  const positions = useStore((s) => s.positions)
  const unit = useStore((s) => s.unit)
  const setUnit = useStore((s) => s.setUnit)

  // Supply is fixed on these tokens, so it falls straight out of the two
  // figures we already carry and market cap is just a constant scale.
  const supply = asset.price > 0 ? asset.marketCap / asset.price : 1
  const scale = unit === 'mcap' ? supply : 1

  const live = useLivePrice(asset)
  const anchor = asset.anchor

  // Report the underlying mark upward after commit — never during render, or
  // React will complain about updating a parent mid-render.
  const markRef = useRef(onMark)
  markRef.current = onMark
  useEffect(() => {
    markRef.current?.(live.price)
  }, [live.price])

  const shownPrice = invertPrice(live.price, anchor)
  const headline = unit === 'mcap' ? usdAbbr(shownPrice * supply) : fmtPrice(shownPrice)
  const bar = hover ?? last
  const up24 = asset.change24h >= 0

  return (
    <section className="flex min-h-0 flex-1 flex-col border border-line bg-surface">
      {/* ── instrument header ──────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-[5px] text-mini font-bold text-void"
          style={{ background: `hsl(${asset.logoHue} 62% 58%)` }}
        >
          {asset.symbol.slice(0, 2)}
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-sm font-semibold">{asset.symbol}</h1>
            <Pill tone="short">
              <Repeat2 size={9} /> INVERSE
            </Pill>
            {asset.private && <Pill tone="info">PRIVATE</Pill>}
          </div>
          <p className="truncate text-mini text-ink-3">{asset.name}</p>
        </div>

        <div className="ml-2 flex items-baseline gap-2">
          <span
            key={live.seq}
            className={cn(
              'num text-xl font-semibold tabular-nums',
              live.dir > 0 && 'text-long',
              live.dir < 0 && 'text-short',
            )}
          >
            {headline}
          </span>
          <span className={cn('num flex items-center gap-0.5 text-xs', up24 ? 'text-long' : 'text-short')}>
            {up24 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {pct(asset.change24h)}
          </span>
        </div>

        <span className="num hidden shrink-0 whitespace-nowrap rounded-[4px] border border-line bg-sunken px-2 py-1 text-micro text-ink-3 xl:inline-block">
          {unit === 'mcap' ? 'MC' : 'Price'} · underlying {fmtPrice(live.price)} · anchor{' '}
          {fmtPrice(anchor)} · Reciprocal
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div
            className="flex items-center rounded-[5px] border border-line bg-sunken p-[2px]"
            title="Supply is fixed, so market cap is price times a constant. Cap is the default because a token quoted at 0.0₉2 is unreadable on an axis."
          >
            {(
              [
                { key: 'mcap' as const, label: 'MC' },
                { key: 'price' as const, label: 'PRICE' },
              ]
            ).map((u) => (
              <button
                key={u.key}
                onClick={() => setUnit(u.key)}
                aria-pressed={unit === u.key}
                className={cn(
                  'num rounded-[3px] px-2 py-[3px] text-micro font-semibold transition-colors',
                  unit === u.key ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {u.label}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-[5px] border border-line bg-sunken p-[2px]">
            {INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => setIntervalValue(i)}
                className={cn(
                  'num rounded-[3px] px-2 py-[3px] text-micro font-semibold transition-colors',
                  interval === i ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── OHLC readout ───────────────────────────────────────────────── */}
      <div className="flex h-6 shrink-0 items-center gap-3 border-b border-line px-3 text-micro">
        <span className="font-semibold text-ink-4">
          INVERSE · {interval}
        </span>
        {bar ? (
          <>
            {(
              [
                ['O', bar.open],
                ['H', bar.high],
                ['L', bar.low],
                ['C', bar.close],
              ] as const
            ).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <span className="text-ink-4">{k}</span>
                <span className={cn('num', bar.close >= bar.open ? 'text-long' : 'text-short')}>
                  {unit === 'mcap' ? abbr(v) : fmtPrice(v)}
                </span>
              </span>
            ))}
            {bar.volume > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-ink-4">VOL</span>
                <span className="num text-ink-2">{abbr(bar.volume)}</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-ink-4">Hover the chart for OHLC</span>
        )}
        <span className="ml-auto text-ink-4">
          {unit === 'mcap' ? 'Market cap' : 'Price'} · log scale · green means {asset.symbol} fell
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <PriceChart
          asset={asset}
          interval={interval}
          scale={scale}
          positions={positions}
          onHover={setHover}
          onLast={setLast}
        />
      </div>
    </section>
  )
}
