'use client'

/**
 * Session equity sparkline.
 *
 * Deliberately not a lightweight-charts instance: this is 120px of context, not
 * an instrument you interact with, and a second chart runtime on the portfolio
 * screen would cost more than the picture is worth.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { rng } from '@/lib/rng'
import { pct, signedUsd, usd } from '@/lib/format'
import { Label } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

const SAMPLE_MS = 3_000
const MAX_POINTS = 220
const SEED_POINTS = 56

/** viewBox units. The SVG is stretched to the container, so these are ratios. */
const W = 600
const H = 120
const PAD = 8

/**
 * A brand-new session has no history, so the curve opens as a barely-breathing
 * flat line at the current equity instead of a single dot pinned to the right
 * edge. The jitter is seeded, never random, so SSR and hydration agree.
 */
function seedHistory(equity: number): number[] {
  const next = rng('equity-curve-seed')
  return Array.from({ length: SEED_POINTS }, () => equity * (1 + (next() - 0.5) * 0.0006))
}

export function EquityCurve({ equity }: { equity: number }) {
  const gradientId = useId()
  const [points, setPoints] = useState<number[]>(() => seedHistory(equity))

  // The prop is mirrored into a ref and sampled on a timer. Reading it during
  // render would make the curve a function of React's render cadence rather
  // than of the clock, and every mark update would push another point.
  const latest = useRef(equity)
  useEffect(() => {
    latest.current = equity
  }, [equity])

  useEffect(() => {
    const t = setInterval(() => {
      setPoints((prev) => {
        const next = [...prev, latest.current]
        return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next
      })
    }, SAMPLE_MS)
    return () => clearInterval(t)
  }, [])

  const geom = useMemo(() => {
    // The head of the line tracks the live prop so the curve never looks frozen
    // between samples; only the tail is on the clock.
    const series = [...points, equity]
    const first = series[0]
    const min = Math.min(...series)
    const max = Math.max(...series)
    // A flat session would divide by zero, and a 1-cent move should not fill the
    // whole box either — so the visible span has a floor of 0.4% of equity.
    const span = Math.max(max - min, Math.max(first * 0.004, 0.01))
    const mid = (max + min) / 2
    const lo = mid - span / 2

    const x = (i: number) => (i / Math.max(series.length - 1, 1)) * W
    const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2)

    const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')

    return {
      line,
      area: `${line} L${W} ${H} L0 ${H} Z`,
      baseline: y(first),
      headY: y(series[series.length - 1]),
      first,
      min,
      max,
    }
  }, [points, equity])

  const delta = equity - geom.first
  const up = delta >= 0

  return (
    <section className="flex min-h-0 flex-col border border-line bg-surface">
      <header className="flex h-[var(--head-h)] shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex items-baseline gap-2">
          <Label>Equity curve</Label>
          <span className="text-micro text-ink-4">session</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="num text-mini font-semibold text-ink">{usd(equity)}</span>
          <span className={cn('num text-mini font-semibold', up ? 'text-long' : 'text-short')}>
            {signedUsd(delta)}
          </span>
          <span className={cn('num text-micro', up ? 'text-long' : 'text-short')}>
            {pct((equity / geom.first - 1) * 100)}
          </span>
        </div>
      </header>

      <div className="relative h-[120px] w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Account equity this session, ${usd(equity)}, ${up ? 'up' : 'down'} ${signedUsd(delta)}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.24" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={geom.area} fill={`url(#${gradientId})`} />

          {/* Where the session started. Everything above it is profit. */}
          <line
            x1="0"
            x2={W}
            y1={geom.baseline}
            y2={geom.baseline}
            stroke="var(--line-strong)"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />

          <path
            d={geom.line}
            fill="none"
            stroke={up ? 'var(--long)' : 'var(--short)'}
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* The head marker lives in the DOM rather than the SVG: with
            preserveAspectRatio="none" a circle would render as an ellipse. */}
        <span
          aria-hidden
          className={cn(
            'absolute right-0 size-[5px] -translate-x-[3px] -translate-y-1/2 rounded-full',
            up ? 'bg-long' : 'bg-short',
          )}
          style={{ top: `${(geom.headY / H) * 100}%` }}
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-1.5">
          <span className="num text-micro text-ink-4">start {usd(geom.first)}</span>
          <span className="num text-micro text-ink-4">
            peak {usd(geom.max)} · trough {usd(geom.min)}
          </span>
        </div>
      </div>
    </section>
  )
}
