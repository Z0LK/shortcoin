'use client'

/**
 * The panel that says what the synthetic short actually is.
 *
 * A venue that only shows you a flipped chart is hiding two real costs: the
 * embedded long-variance position in a reciprocal quote, and the rebalancing
 * decay of a −1x. Both are surfaced here in the same type size as everything
 * else, because a trader who is surprised by carry is a trader who leaves.
 */

import { CornerDownRight } from 'lucide-react'
import { Label, Panel } from '@/components/ui/primitives'
import { useLivePrice } from '@/components/market-provider'
import { useStore } from '@/lib/store'
import {
  INVERSION_BLURBS,
  INVERSION_LABELS,
  carryRate,
  invertPrice,
  volatilityDrag,
} from '@/lib/inversion'
import { rate, usd } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset, InversionMode } from '@/lib/types'

const MODES: InversionMode[] = ['reciprocal', 'mirror', 'compound']

const FORMULAS: Record<InversionMode, string> = {
  reciprocal: 'S = A² / P',
  mirror: 'S = 2A − P',
  compound: 'Sₜ = Sₜ₋₁ · (1 − rₜ)',
}

export function InversionControl({ asset }: { asset: Asset }) {
  const inversion = useStore((s) => s.inversion)
  const setInversion = useStore((s) => s.setInversion)

  const { price: mark } = useLivePrice(asset)
  const synthetic = invertPrice(mark, asset.anchor, inversion)

  const carry = carryRate(asset.vol, asset.borrowFee)
  const decay = volatilityDrag(-1, asset.vol, 1)

  return (
    <Panel
      title="Synthetic inverse"
      right={<span className="num text-micro text-ink-3">{INVERSION_LABELS[inversion]}</span>}
      bodyClassName="flex flex-col gap-2.5 p-3"
    >
      {/* ── What is on screen ──────────────────────────────────────────────── */}
      <div className="rounded-[5px] border border-short/30 bg-short/5 px-2.5 py-2">
        <p className="text-xs font-semibold text-short">Chart is the inverse</p>
        <p className="num mt-0.5 text-mini leading-relaxed text-ink-3">
          Every candle you see is s{asset.symbol}, not {asset.symbol}. A green candle means{' '}
          {asset.symbol} fell.
        </p>
      </div>

      {/* ── Transform ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Label>Transform</Label>
        <div className="grid grid-cols-3 gap-1">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setInversion(m)}
              aria-pressed={inversion === m}
              className={cn(
                'h-6 truncate rounded-[3px] border px-1 text-micro font-semibold transition-colors',
                inversion === m
                  ? 'border-accent/50 bg-accent-soft text-accent'
                  : 'border-line bg-raised text-ink-3 hover:text-ink-2',
              )}
            >
              {INVERSION_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="text-mini leading-[1.45] text-ink-3">{INVERSION_BLURBS[inversion]}</p>
      </div>

      {/* ── Live formula ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 rounded-[5px] border border-line bg-sunken px-2.5 py-2">
        <span className="num text-sm font-semibold text-ink">{FORMULAS[inversion]}</span>
        <span className="num text-micro text-ink-3">
          A = <span className="text-ink-2">{usd(asset.anchor)}</span> session anchor · P ={' '}
          <span className="text-ink-2">{usd(mark)}</span>
        </span>
        <span
          className="num flex items-center gap-1 text-micro text-ink-3"
          title={
            inversion === 'compound'
              ? 'A compounded −1x has no closed form for a single point, so the scalar quote uses the anchored reciprocal as its instantaneous equivalent.'
              : 'The inverse quote implied by the current mark.'
          }
        >
          <CornerDownRight size={10} className="text-ink-4" />S ={' '}
          <span className="font-semibold text-accent">{usd(synthetic)}</span>
        </span>
      </div>

      {/* ── Carry ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div
          className="flex cursor-help items-baseline justify-between gap-3"
          title={`A continuously rebalanced −1x costs about σ² per year on top of borrow: σ = ${rate(asset.vol)} realised, so σ² = ${rate(asset.vol * asset.vol)}, plus ${rate(asset.borrowFee)} borrow on ${asset.symbol}. Quoting the reciprocal raw would hand the holder that variance for free.`}
        >
          <span className="text-mini text-ink-3">Cost of carry (annualised)</span>
          <span className="num text-mini font-semibold text-ink">{rate(carry)}</span>
        </div>
        <span className="num text-micro text-ink-4">
          σ² {rate(asset.vol * asset.vol)} + borrow {rate(asset.borrowFee)}
        </span>
      </div>

      {inversion === 'compound' && (
        <div
          className="flex cursor-help items-baseline justify-between gap-3 border-t border-line pt-2"
          title="Closed-form drag of a continuously rebalanced −1x: −½·L·(L−1)·σ²·T, which is −σ²T at L = −1. Path dependence means a flat round trip in the underlying still loses money here."
        >
          <span className="text-mini text-ink-3">Est. decay over 1 year</span>
          <span className="num text-mini font-semibold text-warn">{rate(decay)}</span>
        </div>
      )}

      {(
        <p className="text-micro leading-[1.45] text-ink-4">
          On the inverted series the liquidation level is drawn as a floor below price: the
          underlying rising is the inverse falling.
        </p>
      )}
    </Panel>
  )
}
