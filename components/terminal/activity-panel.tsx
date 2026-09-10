'use client'

/**
 * The drawer under the chart.
 *
 * One tab strip over four views of the same account. Marks for symbols other
 * than the one on screen are pulled from the engine on a slow interval rather
 * than through a subscription — the book only needs to be roughly live, and a
 * per-tick re-render of the whole drawer would fight the chart for frames.
 */

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Panel, Pill } from '@/components/ui/primitives'
import { useMarket } from '@/components/market-provider'
import { PositionsTable } from '@/components/terminal/positions-table'
import { TradeTape } from '@/components/terminal/trade-tape'
import { HoldersPanel } from '@/components/terminal/holders-panel'
import { useStore } from '@/lib/store'
import { getAsset } from '@/lib/assets'
import { unrealizedPnl } from '@/lib/inversion'
import { abbr, clockTime, price as fmtPrice, signedUsd, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset, Order } from '@/lib/types'

type Tab = 'positions' | 'orders' | 'trades' | 'holders'

const TABS: { key: Tab; label: string }[] = [
  { key: 'positions', label: 'Positions' },
  { key: 'orders', label: 'Orders' },
  { key: 'trades', label: 'Trades' },
  { key: 'holders', label: 'Holders' },
]

const ORDER_COLS =
  'grid grid-cols-[74px_96px_84px_72px_92px_92px_52px_84px_30px] items-center gap-x-2 px-3'

const STATUS_TONE: Record<Order['status'], 'accent' | 'long' | 'neutral'> = {
  open: 'accent',
  filled: 'long',
  cancelled: 'neutral',
}

/** Engine marks for every symbol in the book, refreshed off the render path. */
function useBookMarks(enabled: boolean) {
  const engine = useMarket()
  const positions = useStore((s) => s.positions)
  const [marks, setMarks] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!engine || !enabled) return
    const sync = () => {
      const next: Record<string, number> = {}
      for (const p of useStore.getState().positions) {
        const snap = engine.snapshot(p.symbol)
        if (snap) next[p.symbol] = snap.price
      }
      setMarks(next)
    }
    sync()
    const id = setInterval(sync, 1000)
    return () => clearInterval(id)
  }, [engine, enabled, positions.length])

  return marks
}

function OrdersTable() {
  const orders = useStore((s) => s.orders)
  const cancelOrder = useStore((s) => s.cancelOrder)

  if (orders.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 px-6 text-center">
        <span className="text-xs text-ink-3">No working orders.</span>
        <span className="text-mini text-ink-4">
          Limit and stop tickets rest here until they fill or you cancel them. Market orders never
          land in this tab — they fill immediately.
        </span>
      </div>
    )
  }

  return (
    <div className="min-w-[700px]">
      <div
        className={cn(
          ORDER_COLS,
          'sticky top-0 z-10 h-[var(--head-h)] border-b border-line bg-surface',
          'text-micro font-semibold uppercase tracking-[0.09em] text-ink-4',
        )}
      >
        <span>Time</span>
        <span>Symbol</span>
        <span>Side</span>
        <span>Type</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Lev</span>
        <span className="text-right">Status</span>
        <span />
      </div>

      {orders.map((o) => (
        <div
          key={o.id}
          className={cn(
            ORDER_COLS,
            'h-[var(--row-h-tight)] border-b border-line/40 hover:bg-raised',
            o.status !== 'open' && 'opacity-55',
          )}
        >
          <span className="num text-mini text-ink-3">{clockTime(o.createdAt)}</span>
          <span className="truncate text-xs font-semibold text-ink">{o.symbol}</span>
          <span
            className={cn(
              'text-micro font-bold tracking-[0.06em]',
              o.side === 'long' ? 'text-long' : 'text-short',
            )}
          >
            {o.side === 'long' ? 'LONG' : 'SHORT'}
          </span>
          <span className="text-mini uppercase text-ink-2">{o.type}</span>
          <span className="num text-right text-mini text-ink">
            {o.type === 'market' ? 'Market' : fmtPrice(o.price)}
          </span>
          <span className="flex flex-col items-end leading-tight">
            <span className="num text-mini text-ink-2">{abbr(o.size)}</span>
            <span className="num text-micro text-ink-4">{usdAbbr(o.size * o.price)}</span>
          </span>
          <span className="num text-right text-mini text-ink-2">{o.leverage}x</span>
          <span className="flex justify-end">
            <Pill tone={STATUS_TONE[o.status]} className="uppercase">
              {o.status}
            </Pill>
          </span>
          {o.status === 'open' ? (
            <button
              onClick={() => cancelOrder(o.id)}
              aria-label={`Cancel ${o.type} order on ${o.symbol}`}
              title="Cancel order"
              className="grid size-[22px] place-items-center rounded-[3px] border border-line bg-sunken text-ink-3 transition-colors hover:border-short/40 hover:bg-short/10 hover:text-short"
            >
              <X size={12} />
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  )
}

export function ActivityPanel({ asset, markPrice }: { asset: Asset; markPrice: number }) {
  const [tab, setTab] = useState<Tab>('positions')
  const positions = useStore((s) => s.positions)
  const orders = useStore((s) => s.orders)

  const bookMarks = useBookMarks(tab === 'positions')
  const markPrices = useMemo(
    () => ({ ...bookMarks, [asset.symbol]: markPrice }),
    [bookMarks, asset.symbol, markPrice],
  )

  const openOrders = orders.filter((o) => o.status === 'open').length
  const netPnl = positions.reduce((sum, p) => {
    const mark = markPrices[p.symbol] ?? getAsset(p.symbol)?.price ?? p.entry
    return sum + unrealizedPnl(p.side, p.entry, mark, p.size)
  }, 0)

  const counts: Record<Tab, string | null> = {
    positions: positions.length ? String(positions.length) : null,
    orders: openOrders ? String(openOrders) : null,
    trades: null,
    holders: abbr(asset.holders),
  }

  return (
    <Panel bodyClassName="flex min-h-0 flex-col">
      <div className="flex h-[var(--head-h)] shrink-0 items-center border-b border-line pr-3">
        <div role="tablist" aria-label="Account activity" className="flex items-stretch">
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 text-xs font-semibold transition-colors',
                  active
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-3 hover:text-ink-2',
                )}
              >
                {t.label}
                {counts[t.key] && (
                  <span
                    className={cn(
                      'num rounded-[3px] px-1 text-micro font-bold',
                      active ? 'bg-accent-soft text-accent' : 'bg-raised text-ink-4',
                    )}
                  >
                    {counts[t.key]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {tab === 'positions' && positions.length > 0 && (
            <>
              <span className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-4">
                Net PnL
              </span>
              <span
                className={cn(
                  'num text-mini font-semibold',
                  netPnl < 0 ? 'text-short' : 'text-long',
                )}
              >
                {signedUsd(netPnl)}
              </span>
            </>
          )}
          {tab === 'trades' && (
            <span className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.09em] text-ink-4">
              <span className="pulse-dot size-1.5 rounded-full bg-accent" />
              Live tape
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'positions' && <PositionsTable markPrices={markPrices} />}
        {tab === 'orders' && <OrdersTable />}
        {tab === 'trades' && <TradeTape asset={asset} />}
        {tab === 'holders' && <HoldersPanel asset={asset} />}
      </div>
    </Panel>
  )
}
