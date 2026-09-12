'use client'

/**
 * A series of oracle samples: a line over time, and the table beneath it.
 *
 * Used twice — in a position's detail view (the samples marking it now) and on
 * a settlement receipt (the samples that settled it). Same component, because
 * the question is the same both times: "which prices, at what times, produced
 * this number?"
 */

import { useMemo } from 'react'
import { fixedToNumber, formatMicroPrice } from '@/lib/protocol/fixed'
import type { PriceSample } from '@/lib/protocol/types'
import { useT } from '@/lib/i18n'

const W = 360
const H = 90

export function SampleSeries({
  samples,
  threshold,
  thresholdLabel,
  maxRows = 400,
}: {
  samples: PriceSample[]
  /** A level to draw across the chart — the barrier on a knock-out receipt. */
  threshold?: string
  thresholdLabel?: string
  maxRows?: number
}) {
  const { t } = useT()

  const path = useMemo(() => {
    if (samples.length < 2) return null
    const xs = samples.map((s) => s.at)
    const ys = samples.map((s) => Math.log(Math.max(fixedToNumber(s.price), 1e-30)))
    const th = threshold ? Math.log(Math.max(fixedToNumber(threshold), 1e-30)) : null
    const x0 = xs[0]
    const x1 = xs[xs.length - 1]
    const lo = Math.min(...ys, th ?? Infinity)
    const hi = Math.max(...ys, th ?? -Infinity)
    const pad = (hi - lo) * 0.1 || 0.01
    const x = (v: number) => 4 + ((v - x0) / Math.max(x1 - x0, 1)) * (W - 8)
    const y = (v: number) => 4 + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 8)
    return {
      d: samples.map((s, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(''),
      th: th !== null ? y(th) : null,
    }
  }, [samples, threshold])

  // Newest first in the table: the sample that tipped it over is the one a
  // disputing user looks for first.
  const rows = useMemo(() => [...samples].reverse().slice(0, maxRows), [samples, maxRows])

  return (
    <div className="flex flex-col gap-2">
      {path && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-[12px] border border-line bg-surface" role="img" aria-label={t('positions.samples')}>
          {path.th !== null && (
            <g>
              <line x1="0" x2={W} y1={path.th} y2={path.th} stroke="var(--short)" strokeDasharray="3 3" />
              {thresholdLabel && (
                <text x={W - 6} y={path.th - 3} textAnchor="end" fontSize="8" fill="var(--short)">
                  {thresholdLabel}
                </text>
              )}
            </g>
          )}
          <path d={path.d} fill="none" stroke="var(--info)" strokeWidth="1.3" />
        </svg>
      )}
      <div className="max-h-[260px] overflow-y-auto rounded-[12px] border border-line">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-surface">
            <tr className="mono text-[9.5px] font-medium text-ink-3">
              <th className="px-2 py-1 text-left">{t('receipt.at')}</th>
              <th className="px-2 py-1 text-right">{t('receipt.price')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={`${s.at}-${i}`} className="border-t border-line/60">
                <td className="num px-2 py-0.5 text-micro text-ink-3">{new Date(s.at).toISOString().replace('T', ' ').slice(0, 19)}</td>
                <td className="num px-2 py-0.5 text-right text-micro text-ink-2">{formatMicroPrice(s.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="num text-micro text-ink-4">{t('receipt.samples', { n: samples.length })}</p>
    </div>
  )
}
