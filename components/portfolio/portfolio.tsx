'use client'

/**
 * The portfolio screen.
 *
 * Everything here is derived from two sources: the store's slow-moving book and
 * the market engine's fast marks. The marks are coalesced on a timer rather than
 * applied per tick — a portfolio does not need 60fps, and rebuilding the whole
 * page on every print of every held symbol is the one thing that would make this
 * screen feel cheap.
 */

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ShieldOff, Wallet2, X } from 'lucide-react'
import { useMarket } from '@/components/market-provider'
import { PositionsTable } from '@/components/terminal/positions-table'
import { EquityCurve } from '@/components/portfolio/equity-curve'
import { ExposureBar } from '@/components/portfolio/exposure-bar'
import { Button, Label, Pill, Stat } from '@/components/ui/primitives'
import { useStore } from '@/lib/store'
import { getAsset, CHAIN } from '@/lib/assets'
import { unrealizedPnl } from '@/lib/inversion'
import { abbr, ago, rate, shortAddress, signedUsd, usd, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Order, OrderStatus } from '@/lib/types'

/** Marks refresh cadence. Long enough to be cheap, short enough to feel live. */
const MARK_FLUSH_MS = 700

/**
 * Live mark price for every symbol in the book, batched.
 *
 * Ticks land in a ref and are flushed on an interval, so a book of twenty names
 * costs one render per flush instead of twenty renders per second.
 */
function useMarks(symbols: string[]): Record<string, number> {
  const engine = useMarket()
  const key = symbols.join(',')
  const [marks, setMarks] = useState<Record<string, number>>({})
  const pending = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!engine) return
    const list = key ? key.split(',') : []
    if (list.length === 0) return

    setMarks((prev) => {
      const out = { ...prev }
      let changed = false
      for (const s of list) {
        if (out[s] !== undefined) continue
        const seed = engine.snapshot(s)?.price ?? getAsset(s)?.price
        if (seed !== undefined) {
          out[s] = seed
          changed = true
        }
      }
      return changed ? out : prev
    })

    const unsubs = list.map((s) =>
      engine.subscribe(s, (t) => {
        pending.current[t.symbol] = t.price
      }),
    )
    const flush = setInterval(() => {
      const batch = pending.current
      if (Object.keys(batch).length === 0) return
      pending.current = {}
      setMarks((prev) => ({ ...prev, ...batch }))
    }, MARK_FLUSH_MS)

    return () => {
      unsubs.forEach((u) => u())
      clearInterval(flush)
    }
  }, [engine, key])

  return marks
}

const STATUS_TONE: Record<OrderStatus, 'accent' | 'long' | 'neutral'> = {
  open: 'accent',
  filled: 'long',
  cancelled: 'neutral',
}

export function Portfolio() {
  const wallet = useStore((s) => s.wallet)
  const positions = useStore((s) => s.positions)
  const orders = useStore((s) => s.orders)
  const closeAll = useStore((s) => s.closeAll)
  const cancelOrder = useStore((s) => s.cancelOrder)

  const symbols = useMemo(
    () => [...new Set(positions.map((p) => p.symbol))].sort(),
    [positions],
  )
  const marks = useMarks(symbols)

  const book = useMemo(() => {
    let upnl = 0
    let margin = 0
    for (const p of positions) {
      const mark = marks[p.symbol] ?? p.entry
      // Carry is folded in because it is what closing the position would
      // actually return — the store settles margin + pnl + fees.
      upnl += unrealizedPnl(p.side, p.entry, mark, p.size) + p.fundingPaid + p.borrowPaid
      margin += p.margin
    }
    return { upnl, margin }
  }, [positions, marks])

  const equity = wallet.balance + book.margin + book.upnl
  const openOrders = orders.filter((o) => o.status === 'open')

  // Wall-clock ages are resolved after mount so the server and the first client
  // render cannot disagree.
  const [now, setNow] = useState(0)
  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 1000))
    update()
    const t = setInterval(update, 10_000)
    return () => clearInterval(t)
  }, [])

  // Two-step confirm: closing the whole book is one click away, but not one
  // accidental click away.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4_000)
    return () => clearTimeout(t)
  }, [armed])
  useEffect(() => {
    if (positions.length === 0) setArmed(false)
  }, [positions.length])

  const onCloseAll = () => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    closeAll(marks)
  }

  const bookEmpty = positions.length === 0 && orders.length === 0

  return (
    <div className="h-full overflow-y-auto bg-void">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-px p-px">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 border-l border-line bg-surface md:grid-cols-3 xl:grid-cols-5">
          <HeroStat
            label="Account equity"
            value={usd(equity)}
            hint={`${CHAIN.settlement} · ${shortAddress(wallet.address)}`}
          />
          <HeroStat
            label="Available balance"
            value={usd(wallet.balance)}
            hint="Free collateral"
          />
          <HeroStat
            label="Unrealised PnL"
            value={signedUsd(book.upnl)}
            tone={book.upnl < 0 ? 'short' : 'long'}
            hint={`${positions.length} open position${positions.length === 1 ? '' : 's'}`}
          />
          <HeroStat
            label="Realised PnL"
            value={signedUsd(wallet.realizedPnl)}
            tone={wallet.realizedPnl < 0 ? 'short' : 'long'}
            hint="Session, net of fees"
          />
          <HeroStat
            label="Margin used"
            value={usd(book.margin)}
            hint={
              equity > 0 ? `${rate(book.margin / equity, 1)} of equity` : 'No collateral posted'
            }
          />
        </div>

        {/* ── Glance row ──────────────────────────────────────────────────── */}
        <div className="grid gap-px lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ExposureBar positions={positions} markPrices={marks} />
          <EquityCurve equity={equity} />
        </div>

        {/* ── The book ────────────────────────────────────────────────────── */}
        {bookEmpty ? (
          <EmptyBook balance={wallet.balance} />
        ) : (
          <>
            <section className="flex min-h-0 flex-col border border-line bg-surface">
              <header className="flex h-[var(--head-h)] shrink-0 items-center justify-between border-b border-line px-3">
                <div className="flex items-center gap-2">
                  <Label>Open positions</Label>
                  {positions.length > 0 && (
                    <span className="num text-micro text-ink-3">
                      {positions.length} · {usdAbbr(book.margin)} margin
                    </span>
                  )}
                </div>
                {positions.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCloseAll}
                    className={cn(
                      'gap-1.5',
                      armed && 'border-short/50 bg-short/10 text-short',
                    )}
                  >
                    <ShieldOff size={11} />
                    {armed
                      ? `Confirm — close ${positions.length}`
                      : 'Close all'}
                  </Button>
                )}
              </header>

              {positions.length > 0 ? (
                <PositionsTable markPrices={marks} />
              ) : (
                <p className="px-3 py-4 text-mini text-ink-3">
                  No open positions. Your working orders are listed below.
                </p>
              )}
            </section>

            {orders.length > 0 && (
              <OrdersTable orders={orders} now={now} onCancel={cancelOrder} open={openOrders.length} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function HeroStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone?: 'long' | 'short'
}) {
  return (
    <div className="flex h-[76px] flex-col justify-center border-r border-b border-line px-4">
      <Stat label={label} value={value} tone={tone} hint={hint} />
    </div>
  )
}

function OrdersTable({
  orders,
  now,
  onCancel,
  open,
}: {
  orders: Order[]
  now: number
  onCancel: (id: string) => void
  open: number
}) {
  return (
    <section className="flex min-h-0 flex-col border border-line bg-surface">
      <header className="flex h-[var(--head-h)] shrink-0 items-center gap-2 border-b border-line px-3">
        <Label>Orders</Label>
        <span className="num text-micro text-ink-3">
          {open} working · {orders.length} total
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-line text-micro font-semibold uppercase tracking-[0.09em] text-ink-4">
              <th className="h-[var(--head-h)] px-3 text-left font-semibold">Market</th>
              <th className="px-3 text-left font-semibold">Side</th>
              <th className="px-3 text-left font-semibold">Type</th>
              <th className="px-3 text-right font-semibold">Price</th>
              <th className="px-3 text-right font-semibold">Size</th>
              <th className="px-3 text-right font-semibold">Notional</th>
              <th className="px-3 text-right font-semibold">Lev</th>
              <th className="px-3 text-right font-semibold">Age</th>
              <th className="px-3 text-left font-semibold">Status</th>
              <th className="px-3 text-right font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const asset = getAsset(o.symbol)
              return (
                <tr
                  key={o.id}
                  className={cn(
                    'h-[var(--row-h-tight)] border-b border-line/70 text-mini transition-colors last:border-b-0 hover:bg-raised',
                    o.status === 'cancelled' && 'text-ink-4',
                  )}
                >
                  <td className="px-3">
                    <Link
                      href={`/token/${o.symbol}`}
                      className="flex items-baseline gap-1.5 hover:text-accent"
                    >
                      <span className="num font-semibold text-ink">{o.symbol}</span>
                      <span className="hidden truncate text-micro text-ink-4 lg:inline">
                        {asset?.name}
                      </span>
                    </Link>
                  </td>
                  <td
                    className={cn(
                      'num px-3 font-bold uppercase',
                      o.side === 'long' ? 'text-long' : 'text-short',
                    )}
                  >
                    {o.side}
                  </td>
                  <td className="px-3 capitalize text-ink-2">{o.type}</td>
                  <td className="num px-3 text-right text-ink">{usd(o.price)}</td>
                  <td className="num px-3 text-right text-ink-2">{abbr(o.size)}</td>
                  <td className="num px-3 text-right text-ink-2">
                    {usdAbbr(o.size * o.price)}
                  </td>
                  <td className="num px-3 text-right text-ink-3">{o.leverage}x</td>
                  <td className="num px-3 text-right text-ink-3">
                    {now ? ago(o.createdAt, now) : '—'}
                  </td>
                  <td className="px-3">
                    <Pill tone={STATUS_TONE[o.status]}>{o.status}</Pill>
                  </td>
                  <td className="px-3 text-right">
                    {o.status === 'open' && (
                      <button
                        onClick={() => onCancel(o.id)}
                        aria-label={`Cancel ${o.side} ${o.type} order on ${o.symbol}`}
                        className="inline-grid size-5 place-items-center rounded-[3px] border border-line text-ink-3 transition-colors hover:border-short/50 hover:text-short"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EmptyBook({ balance }: { balance: number }) {
  return (
    <section className="flex flex-col items-center justify-center gap-4 border border-line bg-surface px-6 py-16 text-center">
      <div className="grid size-10 place-items-center rounded-lg border border-line bg-sunken text-ink-3">
        <Wallet2 size={17} />
      </div>

      <div className="flex max-w-[440px] flex-col gap-1.5">
        <h2 className="text-lg font-semibold text-ink">Nothing in the book yet</h2>
        <p className="text-xs leading-relaxed text-ink-2">
          Your demo account is funded with{' '}
          <span className="num font-semibold text-ink">{usd(balance)}</span> of simulated{' '}
          {CHAIN.settlement} on {CHAIN.name}. No real money moves — fills, funding and borrow are all
          simulated so you can test a short before you ever risk anything.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-accent px-4 text-xs font-semibold text-accent-ink transition-all duration-150 hover:brightness-110"
        >
          Browse the scanner
          <ArrowRight size={13} />
        </Link>
        <Link
          href="/how-it-works"
          className="inline-flex h-9 items-center rounded-[5px] border border-line px-4 text-xs font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          How shorting works
        </Link>
      </div>
    </section>
  )
}
