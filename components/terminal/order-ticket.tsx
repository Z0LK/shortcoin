'use client'

/**
 * The ticket.
 *
 * Everything the terminal does converges here: the direction selector writes to
 * the global mode, so flipping it re-points the accent for the entire app and
 * turns this panel red. The summary is deliberately unglamorous — a short's
 * liquidation sits ABOVE its entry, and a ticket that leaves that ambiguous is
 * the fastest way to lose a user their money.
 */

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Check, TrendingDown, TrendingUp } from 'lucide-react'
import { Button, Label, Meter, Panel } from '@/components/ui/primitives'
import { LEVERAGE_PRESETS, ORDER_TYPES, SIZE_PRESETS, useStore } from '@/lib/store'
import { borrowOver, fundingOver, liquidationPrice } from '@/lib/inversion'
import { clamp01, pct, price as fmtPrice, rate, signedRate, signedUsd, usd } from '@/lib/format'
import { CHAIN } from '@/lib/assets'
import { cn } from '@/lib/utils'
import type { Asset, OrderType, Side } from '@/lib/types'

/** Taker crosses the book, a resting limit does not — so they price differently. */
const TAKER_FEE = 0.00045
const MAKER_FEE = 0.00018

/** Matches the default used by `liquidationPrice`. */
const MAINTENANCE = 0.005

const BALANCE_FRACTIONS: { label: string; f: number }[] = [
  { label: '25%', f: 0.25 },
  { label: '50%', f: 0.5 },
  { label: '75%', f: 0.75 },
  { label: 'MAX', f: 1 },
]

const TYPE_LABEL: Record<OrderType, string> = {
  market: 'Market',
  limit: 'Limit',
  stop: 'Stop',
}

/** Inputs are displayed formatted, so grouping separators have to come back out. */
function parseNum(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function Row({
  label,
  value,
  title,
  tone,
}: {
  label: string
  value: React.ReactNode
  title?: string
  tone?: string
}) {
  return (
    <div
      title={title}
      className={cn(
        'flex h-[27px] items-center justify-between gap-3 border-b border-line last:border-b-0',
        title && 'cursor-help',
      )}
    >
      <span className="text-mini text-ink-3">{label}</span>
      <span className={cn('num text-mini font-semibold', tone ?? 'text-ink')}>{value}</span>
    </div>
  )
}

export function OrderTicket({ asset, markPrice }: { asset: Asset; markPrice: number }) {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const wallet = useStore((s) => s.wallet)
  const openPosition = useStore((s) => s.openPosition)
  const placeOrder = useStore((s) => s.placeOrder)

  const [type, setType] = useState<OrderType>('market')
  const [priceInput, setPriceInput] = useState('')
  const [amount, setAmount] = useState('250')
  const [leverage, setLeverage] = useState(2)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmation) return
    const t = setTimeout(() => setConfirmation(null), 2000)
    return () => clearTimeout(t)
  }, [confirmation])

  const short = mode === 'short'
  const limit = parseNum(priceInput)
  const entry = type === 'market' ? markPrice : limit
  const margin = parseNum(amount)
  const notionalUsd = margin * leverage
  const qty = entry > 0 ? notionalUsd / entry : 0

  const liq = entry > 0 ? liquidationPrice(mode, entry, leverage, MAINTENANCE) : 0
  // Room to liquidation as a fraction of entry: 1/L − mm. Falls off fast.
  const room = entry > 0 ? Math.abs(liq - entry) / entry : 0
  const risk = clamp01(1 - room)

  const fee = notionalUsd * (type === 'market' ? TAKER_FEE : MAKER_FEE)
  const borrowDay = borrowOver(mode, asset.borrowFee, notionalUsd, 24)
  const funding8h = fundingOver(mode, asset.fundingRate, notionalUsd, 8)

  const blocked =
    margin <= 0
      ? 'Enter an amount'
      : entry <= 0
        ? 'Enter a price'
        : margin > wallet.balance
          ? 'Insufficient balance'
          : null

  const chooseType = (t: OrderType) => {
    setType(t)
    if (t !== 'market') setPriceInput(fmtPrice(markPrice))
  }

  const setFraction = (f: number) => setAmount(fmtPrice(wallet.balance * f))

  const submit = () => {
    if (blocked) return
    if (type === 'market') {
      const pos = openPosition({ symbol: asset.symbol, side: mode, margin, leverage, price: entry })
      if (!pos) return
      setConfirmation(`Filled ${fmtPrice(pos.size)} ${asset.symbol}`)
      return
    }
    placeOrder({ symbol: asset.symbol, side: mode, type, price: entry, size: qty, leverage })
    setConfirmation(`${TYPE_LABEL[type]} order resting at ${usd(entry)}`)
  }

  return (
    <Panel
      title="Order ticket"
      right={
        <span className="num text-micro text-ink-3">
          Free <span className="text-ink-2">{usd(wallet.balance)}</span>
        </span>
      }
      bodyClassName="flex flex-col gap-3 p-3"
    >
      {/* ── Direction ──────────────────────────────────────────────────────── */}
      <div>
        <div
          role="radiogroup"
          aria-label="Trade direction"
          className="relative isolate grid h-9 grid-cols-2 rounded-[5px] border border-line bg-sunken p-[2px]"
        >
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-[2px] left-[2px] -z-10 w-[calc(50%-2px)] rounded-[3px]',
              'transition-transform duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
              short ? 'translate-x-full bg-short' : 'translate-x-0 bg-long',
            )}
          />
          {(['long', 'short'] as Side[]).map((side) => {
            const active = mode === side
            const Icon = side === 'long' ? TrendingUp : TrendingDown
            return (
              <button
                key={side}
                role="radio"
                aria-checked={active}
                onClick={() => setMode(side)}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-1.5 rounded-[3px] text-xs font-bold uppercase tracking-[0.1em] transition-colors duration-150',
                  active ? 'text-accent-ink' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                <Icon size={14} strokeWidth={2.5} />
                {side}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-mini text-ink-3">
          {short ? (
            <>
              You profit when <span className="num text-ink-2">{asset.symbol}</span>{' '}
              <span className="text-short">falls</span>. Synthetic inverse, settled in {CHAIN.settlement}.
            </>
          ) : (
            <>
              You profit when <span className="num text-ink-2">{asset.symbol}</span>{' '}
              <span className="text-long">rises</span>. Spot token, settled in {CHAIN.settlement}.
            </>
          )}
        </p>
      </div>

      {/* ── Order type ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-line pb-2">
        {ORDER_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => chooseType(t)}
            aria-pressed={type === t}
            className={cn(
              'h-6 rounded-[3px] px-2 text-mini font-semibold transition-colors',
              type === t ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
        <span className="num ml-auto text-micro text-ink-4">
          Mark <span className="text-ink-2">{usd(markPrice)}</span>
        </span>
      </div>

      {type !== 'market' && (
        <div className="flex flex-col gap-1">
          <Label>{type === 'limit' ? 'Limit price' : 'Stop trigger'}</Label>
          <div className="flex h-8 items-center gap-2 rounded-[5px] border border-line bg-sunken px-2 focus-within:border-line-strong">
            <span className="text-mini text-ink-4">USD</span>
            <input
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              aria-label={type === 'limit' ? 'Limit price' : 'Stop trigger price'}
              className="num min-w-0 flex-1 bg-transparent text-right text-sm font-semibold text-ink outline-hidden"
            />
            <button
              onClick={() => setPriceInput(fmtPrice(markPrice))}
              className="text-micro font-semibold text-accent hover:brightness-125"
            >
              MARK
            </button>
          </div>
        </div>
      )}

      {/* ── Size ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label>Collateral</Label>
          <span className="num text-micro text-ink-4">
            {qty > 0 ? `${fmtPrice(qty)} ${asset.symbol}` : `— ${asset.symbol}`}
          </span>
        </div>

        <div className="flex h-8 items-center gap-2 rounded-[5px] border border-line bg-sunken px-2 focus-within:border-line-strong">
          <span className="text-mini text-ink-4">$</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Collateral amount in USD"
            className="num min-w-0 flex-1 bg-transparent text-right text-sm font-semibold text-ink outline-hidden"
          />
          <span className="text-micro font-semibold text-ink-4">{CHAIN.settlement}</span>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {SIZE_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => setAmount(String(s))}
              className="num h-[22px] rounded-[3px] border border-line bg-raised text-micro font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              {s >= 1000 ? `${s / 1000}k` : s}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-1">
          {BALANCE_FRACTIONS.map((b) => (
            <button
              key={b.label}
              onClick={() => setFraction(b.f)}
              className="num h-[22px] rounded-[3px] border border-line bg-sunken text-micro font-semibold text-ink-3 transition-colors hover:border-accent/40 hover:text-accent"
            >
              {b.label}
            </button>
          ))}
        </div>

        <span className="num text-micro text-ink-3">
          Order value <span className="text-ink-2">{usd(notionalUsd)}</span> · {qty > 0 ? fmtPrice(qty) : '—'}{' '}
          {asset.symbol} at {usd(entry > 0 ? entry : markPrice)}
        </span>
      </div>

      {/* ── Leverage ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label>Leverage</Label>
          <span className="num text-mini font-bold text-accent">{leverage}x</span>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {LEVERAGE_PRESETS.map((l) => (
            <button
              key={l}
              onClick={() => setLeverage(l)}
              aria-pressed={leverage === l}
              className={cn(
                'num h-[22px] rounded-[3px] border text-micro font-semibold transition-colors',
                leverage === l
                  ? 'border-accent/50 bg-accent-soft text-accent'
                  : 'border-line bg-raised text-ink-3 hover:text-ink-2',
              )}
            >
              {l}x
            </button>
          ))}
        </div>

        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          aria-label="Leverage multiplier"
          className="h-4 w-full cursor-pointer bg-transparent accent-accent"
        />

        {leverage > 10 && (
          <span className="text-micro text-warn">
            Above 10x a {pct(short ? room * 100 : -room * 100)} move ends the position. Funding and
            borrow are charged on {usd(notionalUsd)} of exposure, not on your collateral.
          </span>
        )}
      </div>

      {/* ── Summary ────────────────────────────────────────────────────────── */}
      <div className="rounded-[5px] border border-line bg-sunken px-2.5">
        <Row label={type === 'market' ? 'Entry price' : 'Working price'} value={usd(entry > 0 ? entry : markPrice)} />
        <Row
          label="Liquidation price"
          title={
            short
              ? 'A short loses as the underlying rises, so liquidation sits above the entry.'
              : 'A long loses as the underlying falls, so liquidation sits below the entry.'
          }
          value={
            <span className="flex items-center gap-1">
              <span className="text-micro font-medium text-ink-3">{short ? 'above' : 'below'}</span>
              {short ? (
                <ArrowUp size={11} className="text-short" />
              ) : (
                <ArrowDown size={11} className="text-short" />
              )}
              {usd(liq)}
            </span>
          }
        />
        <Row
          label="Est. fees"
          title={`${type === 'market' ? 'Taker' : 'Maker'} fee of ${rate(type === 'market' ? TAKER_FEE : MAKER_FEE, 3)} on ${usd(notionalUsd)} of notional.`}
          value={usd(fee)}
        />
        <Row
          label="Borrow (annualised)"
          title="Shorts pay borrow to whoever lends the underlying token. Longs pay none."
          value={
            short ? (
              <span>
                {rate(asset.borrowFee)}{' '}
                <span className="text-ink-4">· {signedUsd(borrowDay)}/day</span>
              </span>
            ) : (
              <span className="text-ink-3">None on longs</span>
            )
          }
          tone={short ? 'text-warn' : undefined}
        />
        <Row
          label="Funding (per 8h)"
          title="Positive funding means longs pay shorts. A short RECEIVES positive funding and separately PAYS borrow; the two can net either way."
          value={
            <span>
              {signedRate(asset.fundingRate)}{' '}
              <span className={funding8h >= 0 ? 'text-long' : 'text-short'}>
                {signedUsd(funding8h)}
              </span>
            </span>
          }
        />
        <Row label="Margin required" value={usd(margin)} />
      </div>

      {/* ── Distance to liquidation ────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label>Distance to liquidation</Label>
          <span
            className={cn('num text-mini font-bold', risk > 0.7 ? 'text-short' : 'text-ink')}
            title={`${asset.symbol} only has to move ${rate(room)} ${short ? 'up' : 'down'} to wipe out ${usd(margin)} of collateral.`}
          >
            {pct(short ? room * 100 : -room * 100)}
          </span>
        </div>
        <Meter value={risk} tone={risk > 0.7 ? 'short' : risk > 0.45 ? 'warn' : 'accent'} />
        <span className="text-micro text-ink-4">
          {leverage}x leaves {rate(room)} of room {short ? 'above' : 'below'} the entry before the
          position is closed for you.
        </span>
      </div>

      {/* ── Submit ─────────────────────────────────────────────────────────── */}
      <Button
        variant={mode}
        size="lg"
        onClick={submit}
        disabled={!!blocked}
        className="h-10 w-full text-sm"
      >
        {confirmation ? (
          <>
            <Check size={14} strokeWidth={3} />
            {confirmation}
          </>
        ) : blocked ? (
          blocked
        ) : short ? (
          `Sell short ${asset.symbol}`
        ) : (
          `Buy / Long ${asset.symbol}`
        )}
      </Button>

      <p className="text-micro text-ink-4">
        Simulated. No real order is placed and no asset changes hands.
      </p>
    </Panel>
  )
}
