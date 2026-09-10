'use client'

/**
 * One scanner row.
 *
 * Memoised and subscribed to a single symbol: a print on NVDAx must repaint one
 * row, never the sixty-one around it. Every value on the row except PRICE comes
 * from the static asset record, so the table's sort order cannot churn under a
 * pointer that is already moving toward a row.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { useLivePrice } from '@/components/market-provider'
import { Button, Meter, Pill } from '@/components/ui/primitives'
import { SIZE_PRESETS, useStore } from '@/lib/store'
import { abbr, pct, price as fmtPrice, rate, signedRate, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset, ShortRoute } from '@/lib/types'
import { CROWDED_SHORT, HARD_TO_BORROW } from './scanner-filters'

/**
 * Whether this name can be shorted at all without SHORTCOIN. "No short route"
 * is the common case on this chain, and seeing it repeated down the column is
 * the fastest possible explanation of what the product is for.
 */
const ROUTE_TONE: Record<ShortRoute, 'long' | 'warn' | 'short'> = {
  borrow: 'long',
  perp: 'warn',
  none: 'short',
}

/** Terse enough to sit on one line at 128px, so row heights stay uniform. */
const ROUTE_LABEL: Record<ShortRoute, string> = {
  borrow: 'SPOT BORROW',
  perp: 'PERP ONLY',
  none: 'NONE',
}

const ROUTE_HINT: Record<ShortRoute, string> = {
  borrow: 'A spot borrow market exists on Morpho — though every one of them currently has nothing supplied.',
  perp: 'A perpetual future is listed on another venue. No spot short.',
  none: 'There is no way to short this token anywhere today. SHORTCOIN is the only route.',
}

/** One-click ticket size. Deliberately unlevered — the row is not the desk. */
const QUICK_MARGIN = SIZE_PRESETS[1]
const QUICK_LEVERAGE = 1

const FUNDING_HINT =
  'Funding settles every 8h. A positive rate means longs pay shorts, so a short position collects it; a negative rate means the short side pays.'

const TD = 'border-b border-line px-2 align-middle'

function borrowTone(fee: number): string {
  if (fee > 0.4) return 'text-short'
  if (fee > HARD_TO_BORROW) return 'text-warn'
  return 'text-ink-2'
}

function shortInterestTone(si: number): { text: string; meter: 'short' | 'warn' | 'accent' } {
  if (si >= CROWDED_SHORT) return { text: 'text-short', meter: 'short' }
  if (si >= 0.3) return { text: 'text-warn', meter: 'warn' }
  return { text: 'text-ink-2', meter: 'accent' }
}

function ScannerRowBase({ asset, index }: { asset: Asset; index: number }) {
  const router = useRouter()
  const live = useLivePrice(asset)

  const mode = useStore((s) => s.mode)
  const openPosition = useStore((s) => s.openPosition)
  const toggleWatch = useStore((s) => s.toggleWatch)
  const watched = useStore((s) => s.watchlist.includes(asset.symbol))

  const [ack, setAck] = useState<'idle' | 'filled' | 'rejected'>('idle')
  const ackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (ackTimer.current) clearTimeout(ackTimer.current) }, [])

  const href = `/t/${asset.symbol}`

  const quickTrade = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const filled = openPosition({
        symbol: asset.symbol,
        side: mode,
        margin: QUICK_MARGIN,
        leverage: QUICK_LEVERAGE,
        price: live.price,
      })
      setAck(filled ? 'filled' : 'rejected')
      if (ackTimer.current) clearTimeout(ackTimer.current)
      ackTimer.current = setTimeout(() => setAck('idle'), 1100)
    },
    [asset.symbol, live.price, mode, openPosition],
  )

  const si = shortInterestTone(asset.shortInterest)

  return (
    <tr
      onClick={() => router.push(href)}
      className="group h-[var(--row-h)] cursor-pointer transition-colors hover:bg-raised"
    >
      <td className={TD}>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleWatch(asset.symbol)
            }}
            aria-label={watched ? `Remove ${asset.symbol} from watchlist` : `Add ${asset.symbol} to watchlist`}
            aria-pressed={watched}
            className={cn(
              'grid size-4 shrink-0 place-items-center rounded-[3px] transition-colors',
              watched
                ? 'text-warn'
                : 'text-ink-4 opacity-0 group-hover:opacity-100 hover:text-ink-2 focus-visible:opacity-100',
            )}
          >
            <Star size={11} fill={watched ? 'currentColor' : 'none'} />
          </button>
          <span className="num text-mini text-ink-4">{index}</span>
        </div>
      </td>

      <td className={TD}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="num grid size-[22px] shrink-0 place-items-center rounded-[3px] text-micro font-bold text-[#0a0c10]"
            style={{ background: `hsl(${asset.logoHue} 58% 60%)` }}
          >
            {asset.symbol.slice(0, 2).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="flex items-center gap-1.5">
              <Link
                href={href}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-semibold text-ink hover:text-accent"
              >
                {asset.symbol}
              </Link>
              {asset.private && <Pill tone="info">PRIVATE</Pill>}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-micro text-ink-3">{asset.name}</span>
              {!asset.private && <Pill className="shrink-0">{asset.sector}</Pill>}
            </span>
          </span>
        </div>
      </td>

      <td className={cn(TD, 'text-right')}>
        <span
          key={live.seq}
          className={cn(
            'num inline-block rounded-[3px] px-1 text-xs font-semibold text-ink',
            live.dir > 0 && 'flash-up',
            live.dir < 0 && 'flash-down',
          )}
        >
          {fmtPrice(live.price)}
        </span>
      </td>

      <td className={cn(TD, 'num text-right text-mini', asset.change1h >= 0 ? 'text-long' : 'text-short')}>
        {pct(asset.change1h)}
      </td>
      <td className={cn(TD, 'num text-right text-mini', asset.change24h >= 0 ? 'text-long' : 'text-short')}>
        {pct(asset.change24h)}
      </td>
      <td className={cn(TD, 'num text-right text-mini', asset.change7d >= 0 ? 'text-long' : 'text-short')}>
        {pct(asset.change7d)}
      </td>

      <td className={cn(TD, 'num text-right text-mini text-ink-2')}>{usdAbbr(asset.volume24h)}</td>
      <td className={cn(TD, 'num text-right text-mini text-ink-2')}>{usdAbbr(asset.liquidity)}</td>
      <td className={cn(TD, 'num text-right text-mini text-ink-2')}>{usdAbbr(asset.marketCap)}</td>
      <td className={cn(TD, 'num text-right text-mini text-ink-3')}>{abbr(asset.holders)}</td>

      <td className={TD}>
        <div className="flex justify-center">
          <Pill
            tone={ROUTE_TONE[asset.shortRoute]}
            title={ROUTE_HINT[asset.shortRoute]}
            className="whitespace-nowrap"
          >
            {ROUTE_LABEL[asset.shortRoute]}
          </Pill>
        </div>
      </td>

      <td className={TD}>
        <div className="flex flex-col items-end gap-1">
          <span className={cn('num text-mini font-semibold', si.text)}>
            {rate(asset.shortInterest, 1)}
          </span>
          <Meter value={asset.shortInterest} tone={si.meter} className="w-full" />
        </div>
      </td>

      <td className={cn(TD, 'num text-right text-mini font-semibold', borrowTone(asset.borrowFee))}>
        {rate(asset.borrowFee)}
      </td>

      <td
        title={FUNDING_HINT}
        className={cn(
          TD,
          'num text-right text-mini',
          asset.fundingRate >= 0 ? 'text-long' : 'text-short',
        )}
      >
        {signedRate(asset.fundingRate)}
      </td>

      <td className={cn(TD, 'pr-3')}>
        <Button
          variant={ack === 'rejected' ? 'outline' : mode}
          size="sm"
          onClick={quickTrade}
          title={`Open a $${QUICK_MARGIN} ${mode} at market on ${asset.symbol}`}
          className="num w-full tracking-[0.06em]"
        >
          {ack === 'filled' ? 'FILLED' : ack === 'rejected' ? 'NO FUNDS' : mode.toUpperCase()}
        </Button>
      </td>
    </tr>
  )
}

export const ScannerRow = memo(ScannerRowBase)
