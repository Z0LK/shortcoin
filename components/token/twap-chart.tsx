'use client'

/**
 * Price chart for the token sheet: spot candles with both TWAPs laid over them.
 *
 * SPEC §4A asks for exactly this, and it is also the best defence against the
 * "your price is wrong" support ticket (§5): the chart shows the spot the user
 * sees on DexScreener AND the two averages the protocol actually settles on,
 * on the same axis, so the gap between them is visible before it is a surprise.
 *
 * No inversion. The chart shows the token as it trades.
 *
 * Axis labels, crosshair and last-price tags all go through formatMicroPrice
 * (§5) — lightweight-charts' own formatter stops at two decimals, which turns
 * every launchpad token into a column of zeros.
 */

import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useAdapterQuery } from '@/components/protocol/provider'
import { useTickHandler } from '@/components/market-provider'
import { formatMicroPrice } from '@/lib/protocol/fixed'
import type { HistoryInterval } from '@/lib/protocol/adapter'
import type { Address } from '@/lib/protocol/types'
import { abbr } from '@/lib/format'
import { useStore } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const INTERVALS: HistoryInterval[] = ['5m', '15m', '1h', '4h']

function css(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export interface ChartLevel {
  price: number
  label: string
  tone: 'short' | 'long' | 'info' | 'warn'
}

export function TwapChart({
  token,
  symbol,
  supply,
  levels = [],
}: {
  token: Address
  symbol: string
  /** Fixed supply, for the market-cap view. 0 disables it. */
  supply: number
  /** Entry / barrier / cap of an open position, drawn as price lines. */
  levels?: ChartLevel[]
}) {
  const { t } = useT()
  const unit = useStore((s) => s.unit)
  const setUnit = useStore((s) => s.setUnit)
  const [interval, setIntervalValue] = useState<HistoryInterval>('15m')
  const scale = unit === 'mcap' && supply > 0 ? supply : 1

  const holder = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const t24Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const t72Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])
  const formatRef = useRef<(v: number) => string>(formatMicroPrice)
  formatRef.current = (v: number) => (scale === 1 ? formatMicroPrice(v) : `$${abbr(v)}`)
  const framed = useRef('')

  const history = useAdapterQuery((a) => a.history(token, interval), [token, interval], { everyMs: 15_000 })

  // ── create once ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!holder.current) return
    const chart = createChart(holder.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: css('--ink-3', '#5c6472'),
        fontSize: 10,
        fontFamily: 'var(--font-numeric), ui-monospace, monospace',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: css('--chart-grid', '#12161d') },
        horzLines: { color: css('--chart-grid', '#12161d') },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: css('--line', '#1c2029'),
        mode: PriceScaleMode.Logarithmic,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: { borderColor: css('--line', '#1c2029'), timeVisible: true, rightOffset: 4 },
      localization: { priceFormatter: (v: number) => formatRef.current(v) },
    })

    const priceFormat = { type: 'custom' as const, minMove: 1e-12, formatter: (v: number) => formatRef.current(v) }

    candleRef.current = chart.addSeries(CandlestickSeries, {
      priceFormat,
      upColor: css('--chart-up', '#21d07a'),
      downColor: css('--chart-down', '#ff3b47'),
      wickUpColor: css('--chart-up', '#21d07a'),
      wickDownColor: css('--chart-down', '#ff3b47'),
      borderVisible: false,
    })
    // The two settlement averages. Distinct colours and dash patterns so they
    // stay distinguishable for anyone who cannot rely on hue.
    t24Ref.current = chart.addSeries(LineSeries, {
      priceFormat,
      color: css('--info', '#4c8dff'),
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'TWAP24',
    })
    t72Ref.current = chart.addSeries(LineSeries, {
      priceFormat,
      color: css('--warn', '#f5a623'),
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'TWAP72',
    })
    volRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' })
    volRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } })

    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
      linesRef.current = []
    }
  }, [])

  // ── data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = history.data
    if (!h || !candleRef.current) return
    const up = css('--chart-volume-up', '#14472f')
    const down = css('--chart-volume-down', '#4a1620')

    candleRef.current.setData(
      h.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open * scale,
        high: c.high * scale,
        low: c.low * scale,
        close: c.close * scale,
      })),
    )
    const line = (pts: { time: number; value: number }[]) =>
      pts.filter((p) => Number.isFinite(p.value)).map((p) => ({ time: p.time as UTCTimestamp, value: p.value * scale }))
    t24Ref.current?.setData(line(h.twap24h))
    t72Ref.current?.setData(line(h.twap72h))
    volRef.current?.setData(
      h.candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? up : down })),
    )

    // Frame the recent stretch once per token and interval, not on every
    // refresh — a chart that snaps back while you are reading it is hostile.
    const key = `${token}:${interval}:${scale}`
    if (framed.current !== key) {
      framed.current = key
      const n = h.candles.length
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(n - 160, 0), to: n + 3 })
    }
  }, [history.data, scale, token, interval])

  // ── position levels ───────────────────────────────────────────────────
  // Keyed on content, not identity: the parent rebuilds the array on every
  // refresh, and redrawing price lines every two seconds makes them flicker.
  const levelKey = JSON.stringify(levels)
  useEffect(() => {
    const s = candleRef.current
    if (!s) return
    linesRef.current.forEach((l) => s.removePriceLine(l))
    const color = { short: css('--short', '#ff3b47'), long: css('--long', '#21d07a'), info: css('--info', '#4c8dff'), warn: css('--warn', '#f5a623') }
    linesRef.current = levels.map((lv) =>
      s.createPriceLine({
        price: lv.price * scale,
        color: color[lv.tone],
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: lv.label,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelKey, scale])

  // ── live spot on the last candle ──────────────────────────────────────
  useTickHandler(symbol, (tick) => {
    const s = candleRef.current
    const h = history.data
    if (!s || !h?.candles.length) return
    const last = h.candles[h.candles.length - 1]
    last.close = tick.price
    last.high = Math.max(last.high, tick.price)
    last.low = Math.min(last.low, tick.price)
    s.update({
      time: last.time as UTCTimestamp,
      open: last.open * scale,
      high: last.high * scale,
      low: last.low * scale,
      close: last.close * scale,
    } as never)
  })

  return (
    <section className="flex min-h-[320px] flex-1 flex-col border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="flex items-center gap-3 text-micro">
          <span className="flex items-center gap-1 text-ink-2">
            <span className="h-2 w-2 rounded-[1px] bg-long" /> {t('token.chart.legendSpot')}
          </span>
          <span className="flex items-center gap-1 text-info">
            <span className="h-0.5 w-3 bg-info" /> {t('token.chart.legendT24')}
          </span>
          <span className="flex items-center gap-1 text-warn">
            <span className="h-0.5 w-3 border-t-2 border-dashed border-warn" /> {t('token.chart.legendT72')}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {supply > 0 && (
            <div className="flex rounded-[5px] border border-line bg-sunken p-[2px]">
              {(['mcap', 'price'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  aria-pressed={unit === u}
                  className={cn('num rounded-[3px] px-2 py-[2px] text-micro font-semibold', unit === u ? 'bg-raised text-ink' : 'text-ink-3')}
                >
                  {u === 'mcap' ? 'MC' : 'PRICE'}
                </button>
              ))}
            </div>
          )}
          <div className="flex rounded-[5px] border border-line bg-sunken p-[2px]">
            {INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => setIntervalValue(i)}
                aria-pressed={interval === i}
                className={cn('num rounded-[3px] px-2 py-[2px] text-micro font-semibold', interval === i ? 'bg-raised text-ink' : 'text-ink-3')}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div ref={holder} className="min-h-0 flex-1" />
      <p className="border-t border-line px-3 py-1 text-micro text-ink-4">{t('token.chart.why')}</p>
    </section>
  )
}
