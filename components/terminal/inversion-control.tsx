'use client'

/**
 * The panel that says what the synthetic short actually is.
 *
 * There is one transform and no menu. The reciprocal is the only one of the
 * three candidates that is an exact mirror on a log axis at every horizon, and
 * the only one that can never print a negative price — so it is what the
 * product ships, and this panel explains it rather than offering alternatives.
 *
 * What it does not hide is the cost: a reciprocal quote carries an embedded
 * long-variance position worth about σ² a year. A trader surprised by carry is
 * a trader who leaves.
 */

import { CornerDownRight } from 'lucide-react'
import { Label, Panel } from '@/components/ui/primitives'
import { useLivePrice } from '@/components/market-provider'
import { useStore } from '@/lib/store'
import { carryRate, invertPrice } from '@/lib/inversion'
import { rate, usd } from '@/lib/format'
import type { Asset } from '@/lib/types'

export function InversionControl({ asset }: { asset: Asset }) {
  const { price: mark } = useLivePrice(asset)
  const synthetic = invertPrice(mark, asset.anchor)

  const carry = carryRate(asset.vol, asset.borrowFee)

  return (
    <Panel
      title="Synthetic inverse"
      right={<span className="num text-micro text-ink-3">Reciprocal</span>}
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

      {/* ── Live formula ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 rounded-[5px] border border-line bg-sunken px-2.5 py-2">
        <span className="num text-sm font-semibold text-ink">S = A² / P</span>
        <span className="num text-micro text-ink-3">
          A = <span className="text-ink-2">{usd(asset.anchor)}</span> session anchor · P ={' '}
          <span className="text-ink-2">{usd(mark)}</span>
        </span>
        <span
          className="num flex items-center gap-1 text-micro text-ink-3"
          title="The inverse quote implied by the current mark. On a log axis this is an exact reflection of the underlying at every horizon, which is why it is the transform the product uses."
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

      <p className="text-micro leading-[1.45] text-ink-4">
        On the inverted series the liquidation level is drawn as a floor below price: the underlying
        rising is the inverse falling.
      </p>
    </Panel>
  )
}
