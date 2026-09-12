'use client'

/**
 * The payoff graph — SPEC §4A calls it the main teaching tool, and it is.
 *
 * X is the token's move from the entry price, in percent. Y is the PnL in
 * USDG. It marks P₀, the barrier, the gain cap and the breakeven; hatches the
 * zone past the cap where the gain stops growing; shades the zone past the
 * barrier where the collateral is gone; and redraws live as the amount changes.
 *
 * The horizon switch is the part people learn the most from: moving it to
 * 7 or 30 days drops the whole curve by the premium paid, and the breakeven
 * visibly walks left. That drift is the thing the spec says must be explicit.
 *
 * Mobile first: the SVG scales to its container through its viewBox, labels
 * stay legible at 320px, and touch drags the crosshair the same way hover does.
 */

import { useMemo, useRef, useState } from 'react'
import { breakevenPrice, positionPnl, type PayoffParams } from '@/lib/protocol/payoff'
import { formatPct } from '@/lib/protocol/fixed'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const W = 360
const H = 200
const PAD = { l: 44, r: 10, t: 14, b: 26 }

function money(n: number) {
  const a = Math.abs(n)
  const s = a >= 10_000 ? `${(a / 1000).toFixed(1)}k` : a >= 1000 ? `${(a / 1000).toFixed(2)}k` : a.toFixed(0)
  return `${n < 0 ? '−' : n > 0 ? '+' : ''}$${s}`
}

export interface PayoffChartProps {
  params: PayoffParams
  capPct: number
  barrierPct: number
  /** Daily premium in USDG, at the quoted rate. Projection only. */
  dailyPremium: number
  /** Premium already paid, for an open position. */
  accruedPremium?: number
  /** Current token move, for an open position's marker. */
  markMovePct?: number
  compact?: boolean
}

export function PayoffChart({
  params,
  capPct,
  barrierPct,
  dailyPremium,
  accruedPremium = 0,
  markMovePct,
  compact,
}: PayoffChartProps) {
  const { t } = useT()
  const [horizon, setHorizon] = useState<0 | 7 | 30>(0)
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const premium = accruedPremium + dailyPremium * horizon

  // Frame the interesting part: a little past the cap on the left, a little
  // past the barrier on the right, whatever tranche the quoter returned.
  const xMin = capPct - 1 - 0.22
  const xMax = barrierPct - 1 + 0.18

  const geo = useMemo(() => {
    const { collateral: C, notional: N, entry } = params
    const yMax = N - C
    const yMin = -C - Math.max(premium, 0)
    const span = yMax - yMin || 1
    const pad = span * 0.08

    const x = (m: number) => PAD.l + ((m - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r)
    const y = (v: number) => PAD.t + (1 - (v - (yMin - pad)) / (span + 2 * pad)) * (H - PAD.t - PAD.b)
    const pnlAt = (m: number) => positionPnl(params, entry * (1 + m), premium)

    const steps = 90
    const pts: string[] = []
    for (let i = 0; i <= steps; i++) {
      const m = xMin + ((xMax - xMin) * i) / steps
      pts.push(`${x(m).toFixed(1)},${y(pnlAt(m)).toFixed(1)}`)
    }
    // The kinks must be exact, not wherever a sample happened to land.
    const kinks = [capPct - 1, barrierPct - 1].map((m) => ({ m, v: pnlAt(m) }))

    const be = breakevenPrice(params, premium) / entry - 1
    const be0 = breakevenPrice(params, accruedPremium) / entry - 1

    return { x, y, pts, kinks, pnlAt, yMax, yMin, be, be0 }
  }, [params, premium, accruedPremium, xMin, xMax, capPct, barrierPct])

  const capX = geo.x(capPct - 1)
  const barX = geo.x(barrierPct - 1)
  const zeroY = geo.y(0)

  const onPointer = (clientX: number) => {
    const el = svgRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const vx = ((clientX - box.left) / box.width) * W
    const m = xMin + ((vx - PAD.l) / (W - PAD.l - PAD.r)) * (xMax - xMin)
    setHover(Math.min(Math.max(m, xMin), xMax))
  }

  const ticks = [capPct - 1, (capPct - 1) / 2, 0, (barrierPct - 1) / 2, barrierPct - 1]

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="mono text-[9.5px] font-medium text-ink-3">{t('payoff.title')}</span>
        <div className="flex items-center gap-1">
          <span className="text-micro text-ink-4">{t('payoff.horizon')}</span>
          <div className="seg">
            {([0, 7, 30] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                aria-pressed={horizon === h}
                className={cn(
                  'rounded-full px-1.5 py-[2px] text-micro font-semibold',
                  horizon === h ? 'bg-ink text-void' : 'text-ink-3 hover:text-ink',
                )}
              >
                {t(`payoff.horizon.${h}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={cn('w-full touch-none select-none', compact ? 'max-h-[170px]' : '')}
        role="img"
        aria-label={t('payoff.title')}
        onPointerMove={(e) => onPointer(e.clientX)}
        onPointerDown={(e) => onPointer(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--long)" strokeWidth="1.2" strokeOpacity="0.35" />
          </pattern>
        </defs>

        {/* Past the cap: the gain stops growing. Hatched, per the spec. */}
        <rect x={PAD.l} y={PAD.t} width={Math.max(capX - PAD.l, 0)} height={H - PAD.t - PAD.b} fill="url(#hatch)">
          <title>{t('payoff.capZone')}</title>
        </rect>
        {/* Past the barrier: knocked out, collateral gone. */}
        <rect
          x={barX}
          y={PAD.t}
          width={Math.max(W - PAD.r - barX, 0)}
          height={H - PAD.t - PAD.b}
          fill="var(--short)"
          fillOpacity="0.1"
        >
          <title>{t('payoff.koZone')}</title>
        </rect>

        {/* Axes */}
        <line x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY} stroke="var(--line-strong)" strokeWidth="1" />
        {[geo.yMax, geo.yMin].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={PAD.l - 4} y={geo.y(v) + 3} textAnchor="end" fontSize="8.5" fill="var(--ink-3)" fontFamily="var(--font-ui)">
              {money(v)}
            </text>
          </g>
        ))}
        <text x={PAD.l - 4} y={zeroY + 3} textAnchor="end" fontSize="8.5" fill="var(--ink-4)" fontFamily="var(--font-ui)">
          $0
        </text>
        {ticks.map((m) => (
          <text
            key={m}
            x={geo.x(m)}
            y={H - 8}
            textAnchor="middle"
            fontSize="8.5"
            fill="var(--ink-3)"
            fontFamily="var(--font-ui)"
          >
            {formatPct(m, 0, true)}
          </text>
        ))}

        {/* Reference verticals */}
        {[
          { m: 0, label: t('payoff.entry'), color: 'var(--info)' },
          { m: capPct - 1, label: t('payoff.cap'), color: 'var(--long)' },
          { m: barrierPct - 1, label: t('payoff.barrier'), color: 'var(--short)' },
        ].map((r) => (
          <g key={r.label}>
            <line x1={geo.x(r.m)} x2={geo.x(r.m)} y1={PAD.t} y2={H - PAD.b} stroke={r.color} strokeWidth="1" strokeOpacity="0.7" />
            <text x={geo.x(r.m) + 3} y={PAD.t + 8} fontSize="8.5" fill={r.color} fontWeight="600">
              {r.label}
            </text>
          </g>
        ))}

        {/* Breakeven, and where it started if premium has moved it. */}
        {horizon > 0 || accruedPremium > 0 ? (
          <line
            x1={geo.x(geo.be0)}
            x2={geo.x(geo.be0)}
            y1={zeroY - 5}
            y2={zeroY + 5}
            stroke="var(--ink-4)"
            strokeWidth="1"
          />
        ) : null}
        <g>
          <circle cx={geo.x(geo.be)} cy={zeroY} r="3" fill="var(--warn)" />
          <text x={geo.x(geo.be)} y={zeroY + 13} textAnchor="middle" fontSize="8.5" fill="var(--warn)" fontWeight="600">
            {t('payoff.breakeven')} {formatPct(geo.be, 1, true)}
          </text>
        </g>

        {/* The payoff itself */}
        <polyline points={geo.pts.join(" ")} fill="none" stroke="var(--sig)" strokeWidth="1.8" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgba(138,123,255,0.5))" }} />
        {geo.kinks.map((k) => (
          <circle key={k.m} cx={geo.x(k.m)} cy={geo.y(k.v)} r="2.2" fill="var(--sig)" />
        ))}

        {/* Where an open position is right now */}
        {markMovePct !== undefined && markMovePct >= xMin && markMovePct <= xMax && (
          <circle cx={geo.x(markMovePct)} cy={geo.y(geo.pnlAt(markMovePct))} r="4" fill="var(--accent)" stroke="var(--void)" strokeWidth="1.5" />
        )}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-3)" strokeDasharray="2 2" />
            <circle cx={geo.x(hover)} cy={geo.y(geo.pnlAt(hover))} r="3" fill="var(--ink)" />
            <rect
              x={Math.min(geo.x(hover) + 6, W - PAD.r - 92)}
              y={PAD.t + 14}
              width="88"
              height="26"
              rx="3"
              fill="var(--overlay)"
              stroke="var(--line-strong)"
            />
            <text x={Math.min(geo.x(hover) + 12, W - PAD.r - 86)} y={PAD.t + 25} fontSize="8.5" fill="var(--ink-3)" fontFamily="var(--font-ui)">
              {formatPct(hover, 1, true)}
            </text>
            <text
              x={Math.min(geo.x(hover) + 12, W - PAD.r - 86)}
              y={PAD.t + 36}
              fontSize="9.5"
              fontWeight="600"
              fill={geo.pnlAt(hover) >= 0 ? 'var(--long)' : 'var(--short)'}
              fontFamily="var(--font-ui)"
            >
              {money(geo.pnlAt(hover))}
            </text>
          </g>
        )}
      </svg>

      {horizon > 0 && (
        <p className="text-micro text-ink-3">
          {t('payoff.drift', { pct: formatPct(Math.abs(geo.be - geo.be0), 1), days: horizon })}
        </p>
      )}
    </div>
  )
}
