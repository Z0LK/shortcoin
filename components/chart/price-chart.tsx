'use client'

/**
 * The chart.
 *
 * Two things make this different from a stock candlestick component:
 *
 *  1. It never plots the underlying. SHORTCOIN only sells, so the series on
 *     screen is always the synthetic inverse — a green candle means the stock
 *     fell and the trade is working. The log scale is what makes that inverse
 *     an exact reflection rather than a lookalike (ln S = 2·ln A − ln P).
 *  2. Position overlays are projected into inverse space too, which puts the
 *     liquidation line BELOW the price rather than above it. Getting that
 *     backwards would be the most dangerous bug this product could ship.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  PriceScaleMode,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useTickHandler } from '@/components/market-provider'
import { invertCandle, invertSeries, invertPrice } from '@/lib/inversion'
import { generateCandles, type Interval } from '@/lib/sim'
import type { Asset, Candle, InversionMode, Position } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Bars generated per interval. Deep enough that scrolling back is a real
 * activity rather than hitting a wall after a screen and a half — 2000 one-day
 * bars is roughly eight years of tape.
 */
const HISTORY_BARS = 2000

/** Bars framed on first paint. The rest is scrollback. */
const VISIBLE_BARS = 190

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export interface ChartHover {
  candle: Candle | null
}

interface Props {
  asset: Asset
  interval: Interval
  inversion: InversionMode
  positions: Position[]
  onHover?: (c: Candle | null) => void
  onLast?: (c: Candle) => void
  className?: string
}

export function PriceChart({
  asset,
  interval,
  inversion,
  positions,
  onHover,
  onLast,
  className,
}: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])

  /** Underlying history. Regenerated only when the symbol or interval changes. */
  const [history, setHistory] = useState<Candle[] | null>(null)
  const workingRef = useRef<Candle | null>(null)
  const [flipping, setFlipping] = useState(false)

  // Generated after mount so the server never has to agree on a timestamp.
  useEffect(() => {
    const h = generateCandles(asset, interval, HISTORY_BARS)
    workingRef.current = h[h.length - 1]
    setHistory(h)
  }, [asset, interval])

  const anchor = history?.[0]?.open ?? asset.anchor

  const toDisplay = useMemo(
    () => (c: Candle) => invertCandle(c, anchor, inversion),
    [anchor, inversion],
  )

  // ── create ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!holder.current) return

    const chart = createChart(holder.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: cssVar('--ink-3', '#5c6472'),
        fontSize: 10,
        fontFamily: 'var(--font-numeric), ui-monospace, monospace',
        attributionLogo: false,
        panes: { separatorColor: cssVar('--line', '#1c2029'), separatorHoverColor: 'transparent' },
      },
      grid: {
        vertLines: { color: cssVar('--chart-grid', '#12161d') },
        horzLines: { color: cssVar('--chart-grid', '#12161d') },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: cssVar('--chart-crosshair', '#566072'),
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: cssVar('--overlay', '#171b22'),
        },
        horzLine: {
          color: cssVar('--chart-crosshair', '#566072'),
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: cssVar('--overlay', '#171b22'),
        },
      },
      rightPriceScale: {
        borderColor: cssVar('--line', '#1c2029'),
        // Log scale is not a preference here — it is what makes the inversion a
        // true reflection rather than a lookalike.
        mode: PriceScaleMode.Logarithmic,
        scaleMargins: { top: 0.08, bottom: 0.26 },
      },
      timeScale: {
        borderColor: cssVar('--line', '#1c2029'),
        rightOffset: 4,
        barSpacing: 7,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
    })

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: cssVar('--chart-up', '#21d07a'),
      downColor: cssVar('--chart-down', '#ff3b47'),
      wickUpColor: cssVar('--chart-up', '#21d07a'),
      wickDownColor: cssVar('--chart-down', '#ff3b47'),
      borderVisible: false,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dotted,
      priceLineColor: cssVar('--ink-3', '#5c6472'),
    })

    const volume = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, priceScaleId: '' },
      0,
    )
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    chartRef.current = chart
    candleRef.current = candles
    volumeRef.current = volume

    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
      linesRef.current = []
    }
  }, [])

  // ── crosshair readout ─────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    const series = candleRef.current
    if (!chart || !series || !onHover) return

    const handler = (param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0]) => {
      const d = param.seriesData.get(series) as CandlestickData<Time> | undefined
      if (!d || param.time === undefined) {
        onHover(null)
        return
      }
      onHover({
        time: Number(param.time),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: 0,
      })
    }

    chart.subscribeCrosshairMove(handler)
    return () => chart.unsubscribeCrosshairMove(handler)
  }, [onHover])

  // ── data ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const candles = candleRef.current
    const volume = volumeRef.current
    if (!candles || !volume || !history) return

    const shown = invertSeries(history, inversion, anchor)

    candles.setData(
      shown.map<CandlestickData<Time>>((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    )

    const up = cssVar('--chart-volume-up', '#14472f')
    const down = cssVar('--chart-volume-down', '#4a1620')
    volume.setData(
      shown.map<HistogramData<Time>>((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? up : down,
      })),
    )

    // fitContent() would squash every bar we just generated into the panel.
    // Frame the recent slice instead and leave the rest to be scrolled into.
    chartRef.current?.timeScale().setVisibleLogicalRange({
      from: Math.max(shown.length - VISIBLE_BARS, 0),
      to: shown.length + 3,
    })
    onLast?.(shown[shown.length - 1])
    // `onLast` is intentionally excluded: it changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, inversion, anchor])

  // ── transform change ──────────────────────────────────────────────────────
  // Switching transform redraws the whole series, so it gets the same brief
  // wash the direction flip used to: without it the curve teleports.
  const firstDraw = useRef(true)
  useEffect(() => {
    if (firstDraw.current) {
      firstDraw.current = false
      return
    }
    setFlipping(true)
    const t = setTimeout(() => setFlipping(false), 420)
    return () => clearTimeout(t)
  }, [inversion])

  // ── position overlays ─────────────────────────────────────────────────────
  useEffect(() => {
    const series = candleRef.current
    if (!series) return

    linesRef.current.forEach((l) => series.removePriceLine(l))
    linesRef.current = []

    const mine = positions.filter((p) => p.symbol === asset.symbol)
    const project = (p: number) => invertPrice(p, anchor, inversion)

    mine.forEach((p) => {
      linesRef.current.push(
        series.createPriceLine({
          price: project(p.entry),
          color: cssVar('--info', '#4c8dff'),
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'SHORT',
        }),
      )
      linesRef.current.push(
        series.createPriceLine({
          price: project(p.liquidation),
          color: cssVar('--warn', '#f5a623'),
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'LIQ',
        }),
      )
    })
  }, [positions, asset.symbol, anchor, inversion])

  // ── live ticks ────────────────────────────────────────────────────────────
  useTickHandler(asset.symbol, (t) => {
    const candles = candleRef.current
    const volume = volumeRef.current
    if (!candles || !volume) return

    workingRef.current = t.candle
    const c = toDisplay(t.candle)

    candles.update({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })
    volume.update({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color:
        c.close >= c.open
          ? cssVar('--chart-volume-up', '#14472f')
          : cssVar('--chart-volume-down', '#4a1620'),
    })
    onLast?.(c)
  })

  return (
    <div className={cn('relative h-full w-full', className)}>
      <div
        ref={holder}
        className={cn(
          'h-full w-full transition-opacity duration-200',
          flipping ? 'opacity-0' : 'opacity-100',
        )}
      />

      {/* The axis of reflection. It sweeps out across the panel during a flip,
          standing in for the mirror line the transform is pivoting on. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-1/2 h-px origin-center bg-accent transition-all duration-200 ease-out',
          flipping ? 'scale-x-100 opacity-90' : 'scale-x-0 opacity-0',
        )}
        style={{ boxShadow: '0 0 22px 1px var(--accent)' }}
      />

      {!history && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-micro uppercase tracking-[0.12em] text-ink-4">Loading tape…</span>
        </div>
      )}
    </div>
  )
}
