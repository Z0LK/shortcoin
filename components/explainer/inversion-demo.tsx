'use client'

/**
 * The proof, not the pitch.
 *
 * Everything about this widget is deliberately self-contained: one fixed price
 * path, plain SVG, no chart library. The reader has to be able to grab the
 * marker, change the axis and watch the identity hold — a static picture of a
 * reflection proves nothing, and lightweight-charts cannot draw two series in
 * one reflected coordinate space without lying about the numbers.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { generateCandles } from '@/lib/sim'
import { INVERSION_BLURBS, INVERSION_LABELS, invertSeries } from '@/lib/inversion'
import { pct, price as fmtPrice, rate, signedUsd } from '@/lib/format'
import { Label, Pill } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { Candle, InversionMode } from '@/lib/types'

type Axis = 'linear' | 'log'

const MODES: InversionMode[] = ['reciprocal', 'mirror', 'compound']

/**
 * One fixed path, built at module scope: the server and the client must render
 * the identical demo, and a reader who reloads after spotting something should
 * find it still there.
 */
const BARS = 90
const RAW = generateCandles(
  { symbol: 'DEMO', price: 184.2, vol: 0.34, drift: 0.16, volume24h: 12e6 },
  '1d',
  BARS,
  1_780_000_000,
)

// Force the first bar to open where it closes so every transform starts exactly
// on the anchor: the two curves then share an origin instead of nearly sharing one.
const PATH: Candle[] = RAW.map((c, i) => (i === 0 ? { ...c, open: c.close } : c))
const ANCHOR = PATH[0].close
const UNDER = PATH.map((c) => c.close)

const INVERSE: Record<InversionMode, number[]> = {
  reciprocal: invertSeries(PATH, 'reciprocal', ANCHOR).map((c) => c.close),
  mirror: invertSeries(PATH, 'mirror', ANCHOR).map((c) => c.close),
  compound: invertSeries(PATH, 'compound', ANCHOR).map((c) => c.close),
}

/** Stake used for the worked PnL readout, in USD. */
const STAKE = 1000

const W = 880
const H = 300
const PAD_L = 10
const PAD_R = 58
const PAD_T = 14
const PAD_B = 22
const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

const GRID_STEPS = [-1, -0.5, 0, 0.5, 1]
const X_TICKS = [0, 30, 60, 89]

/** Where the reflection would land if the fold about the anchor were perfect. */
function reflect(p: number, axis: Axis): number {
  return axis === 'log' ? (ANCHOR * ANCHOR) / p : 2 * ANCHOR - p
}

export function InversionDemo() {
  const [mode, setMode] = useState<InversionMode>('reciprocal')
  const [axis, setAxis] = useState<Axis>('log')
  const [index, setIndex] = useState(BARS - 1)
  const svgRef = useRef<SVGSVGElement>(null)

  const inverse = INVERSE[mode]

  const view = useMemo(() => {
    const t = axis === 'log' ? Math.log : (v: number) => v
    const centre = t(ANCHOR)

    // A domain kept symmetric about the anchor puts the axis of reflection on
    // the exact vertical centre, which is what makes the fold readable at all.
    let radius = 0
    for (let i = 0; i < BARS; i++) {
      radius = Math.max(radius, Math.abs(t(UNDER[i]) - centre), Math.abs(t(inverse[i]) - centre))
    }
    radius = (radius || 1) * 1.16

    const y = (v: number) => PAD_T + (1 - (t(v) - centre + radius) / (2 * radius)) * PLOT_H
    const x = (i: number) => PAD_L + (i / (BARS - 1)) * PLOT_W
    // Coordinates are rounded before they reach the DOM. Math.log is not
    // required to be correctly rounded, so Node and the browser can disagree in
    // the last bits — enough to trip React's hydration check on a 90-point path.
    const q = (n: number) => Math.round(n * 100) / 100
    const line = (vals: number[]) => vals.map((v, i) => `${q(x(i))},${q(y(v))}`).join(' ')

    const gridValue = (k: number) =>
      axis === 'log' ? Math.exp(centre + k * radius) : ANCHOR + k * radius

    let deviation = 0
    for (let i = 0; i < BARS; i++) {
      deviation = Math.max(deviation, Math.abs(inverse[i] / reflect(UNDER[i], axis) - 1))
    }

    return { x, y, line, gridValue, deviation }
  }, [axis, inverse])

  const scrub = useCallback((clientX: number) => {
    const el = svgRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const vx = ((clientX - box.left) / box.width) * W
    const i = Math.round(((vx - PAD_L) / PLOT_W) * (BARS - 1))
    setIndex(Math.min(Math.max(i, 0), BARS - 1))
  }, [])

  const p = UNDER[index]
  const s = inverse[index]
  const inversePnl = STAKE * (s / ANCHOR - 1)
  const classicPnl = STAKE * (1 - p / ANCHOR)
  const exact = view.deviation < 1e-9

  return (
    <figure className="my-12 rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-4 py-3">
        <div className="mr-auto flex flex-col gap-1">
          <Label>Live inversion</Label>
          <div className="flex items-center gap-4 text-mini">
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="h-[2px] w-4 rounded-full bg-ink-2" />
              Underlying DEMO
            </span>
            <span className="flex items-center gap-1.5 text-short">
              <span className="h-[2px] w-4 rounded-full bg-short" />
              Inverse sDEMO
            </span>
          </div>
        </div>

        <Segmented
          ariaLabel="Inversion transform"
          value={mode}
          options={MODES.map((m) => ({ value: m, label: INVERSION_LABELS[m] }))}
          onChange={setMode}
        />
        <Segmented
          ariaLabel="Price axis"
          value={axis}
          options={[
            { value: 'linear', label: 'Linear' },
            { value: 'log', label: 'Log' },
          ]}
          onChange={setAxis}
        />
      </header>

      <div className="px-2 pt-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Underlying price path and its ${INVERSION_LABELS[mode].toLowerCase()} inverse on a ${axis} axis`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            scrub(e.clientX)
          }}
          onPointerMove={(e) => scrub(e.clientX)}
        >
          {GRID_STEPS.map((k) => {
            const v = view.gridValue(k)
            const y = view.y(v)
            return (
              <g key={k}>
                <line
                  x1={PAD_L}
                  x2={PAD_L + PLOT_W}
                  y1={y}
                  y2={y}
                  className="stroke-line"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text x={PAD_L + PLOT_W + 7} y={y + 3} className="num fill-ink-4 text-[9px]">
                  {fmtPrice(v)}
                </text>
              </g>
            )
          })}

          {X_TICKS.map((i) => (
            <text
              key={i}
              x={view.x(i)}
              y={H - 6}
              textAnchor={i === 0 ? 'start' : i === 89 ? 'end' : 'middle'}
              className="num fill-ink-4 text-[9px]"
            >
              {i === 89 ? '90 sessions' : i}
            </text>
          ))}

          {/* The axis of reflection. Both transforms fold about this level. */}
          <line
            x1={PAD_L}
            x2={PAD_L + PLOT_W}
            y1={view.y(ANCHOR)}
            y2={view.y(ANCHOR)}
            className="stroke-line-strong"
            strokeWidth={1}
            strokeDasharray="3 4"
            shapeRendering="crispEdges"
          />
          <text
            x={PAD_L + PLOT_W + 7}
            y={view.y(ANCHOR) - 5}
            className="num fill-ink-3 text-[9px] font-semibold"
          >
            anchor
          </text>

          <polyline
            points={view.line(UNDER)}
            fill="none"
            className="stroke-ink-2"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <polyline
            points={view.line(inverse)}
            fill="none"
            className="stroke-short"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />

          <line
            x1={view.x(index)}
            x2={view.x(index)}
            y1={PAD_T}
            y2={PAD_T + PLOT_H}
            className="stroke-line-strong"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          <circle cx={view.x(index)} cy={view.y(p)} r={3.5} className="fill-ink" />
          <circle cx={view.x(index)} cy={view.y(s)} r={3.5} className="fill-short" />
        </svg>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
        <Label>Marker</Label>
        <input
          type="range"
          min={0}
          max={BARS - 1}
          step={1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label="Move the marker along the price path"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-accent"
        />
        <span className="num w-[92px] text-right text-mini text-ink-3">
          session {index}
          {index === 0 ? ' · anchor' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 border-t border-line md:grid-cols-4">
        <Readout
          label="Underlying"
          value={`$${fmtPrice(p)}`}
          hint={pct((p / ANCHOR - 1) * 100)}
          hintTone={p >= ANCHOR ? 'long' : 'short'}
        />
        <Readout
          label="Inverse"
          value={`$${fmtPrice(s)}`}
          hint={pct((s / ANCHOR - 1) * 100)}
          hintTone={s >= ANCHOR ? 'long' : 'short'}
        />
        <Readout
          label={`$${STAKE.toLocaleString('en-US')} of inverse`}
          value={signedUsd(inversePnl)}
          valueTone={inversePnl >= 0 ? 'long' : 'short'}
          hint="bought at the anchor"
        />
        <Readout
          label="Same size, classic short"
          value={signedUsd(classicPnl)}
          valueTone={classicPnl >= 0 ? 'long' : 'short'}
          hint={
            Math.abs(inversePnl - classicPnl) < 0.005
              ? 'identical here'
              : `${signedUsd(inversePnl - classicPnl)} apart`
          }
        />
      </div>

      <figcaption className="flex flex-col gap-2 border-t border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {exact ? (
            <Pill tone="info">EXACT MIRROR</Pill>
          ) : (
            <Pill tone="warn">OFF BY {rate(view.deviation, 2)}</Pill>
          )}
          <span className="text-mini text-ink-3">
            {INVERSION_LABELS[mode]} · {axis === 'log' ? 'logarithmic' : 'linear'} axis
          </span>
        </div>
        <p className="text-sm leading-[1.7] text-ink-2">{mirrorNote(mode, axis, view.deviation)}</p>
        <p className="text-mini leading-[1.7] text-ink-3">{INVERSION_BLURBS[mode]}</p>
      </figcaption>
    </figure>
  )
}

function mirrorNote(mode: InversionMode, axis: Axis, deviation: number): string {
  const off = rate(deviation, 2)

  if (mode === 'compound') {
    return `Never a mirror, on either axis. The compounded −1x applies each bar's negated return to its own running level, so it carries the whole path with it and ends up ${off} away from the reflection here. That gap is volatility decay. It is a real cost of holding the instrument, not an artefact of how this is drawn.`
  }

  if (mode === 'reciprocal') {
    return axis === 'log'
      ? 'Exact. On a logarithmic axis the reciprocal is a true reflection: ln S = 2·ln A − ln P, so ln(S₁/S₀) = −ln(P₁/P₀) at every horizon, for every path. Fold the sheet along the dashed line and the two curves land on each other. This is why SHORTCOIN charts a log axis by default — the flip is a mirror, not a lookalike.'
      : `Not a mirror on this axis, and it should not be. The reciprocal is convex: a 10% fall in the underlying is worth more than a 10% rise costs, so the curves sit up to ${off} apart from a linear fold. Switch the axis to log and that gap goes to exactly zero.`
  }

  return axis === 'linear'
    ? 'Exact. S − A = −(P − A) by construction, so on a linear axis the fold is perfect and absolute PnL matches a classic short one-to-one. It stays perfect until the underlying approaches twice the anchor, where S runs into zero and the instrument has to be re-anchored.'
    : `Not a mirror on this axis. The linear mirror folds around a level, the log axis measures ratios, and the two disagree by up to ${off} here. Switch back to linear.`
}

function Readout({
  label,
  value,
  valueTone,
  hint,
  hintTone,
}: {
  label: string
  value: string
  valueTone?: 'long' | 'short'
  hint: string
  hintTone?: 'long' | 'short'
}) {
  const tones = { long: 'text-long', short: 'text-short' }
  return (
    <div className="flex flex-col gap-1 border-line px-4 py-3 not-first:border-l">
      <Label>{label}</Label>
      <span
        className={cn('num text-lg font-semibold', valueTone ? tones[valueTone] : 'text-ink')}
      >
        {value}
      </span>
      <span className={cn('num text-mini', hintTone ? tones[hintTone] : 'text-ink-4')}>{hint}</span>
    </div>
  )
}

function Segmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex h-7 items-center rounded-[5px] border border-line bg-sunken p-[2px]"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-full items-center rounded-[3px] px-2.5 text-mini font-semibold transition-colors duration-150',
            value === o.value ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
