'use client'

/**
 * Positions — SPEC §4B.
 *
 * One row per position, expandable. On every row:
 *   - entry price, current settlement price, and the spot beside it greyed
 *     (§5: never the spot alone on a position screen)
 *   - distance to the barrier, and the effective barrier that drifts down as
 *     premium is paid
 *   - premium paid so far and the runway left at the current rate
 *   - equity and PnL, with V(P) − premium kept visibly apart from gross PnL
 *   - a badge when the settlement window has been extended, with the reason
 *   - a badge while the position is not yet eligible for payout
 *
 * The expanded view shows the samples that marked the position.
 */

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, FileText, Zap } from 'lucide-react'
import { useAdapterQuery, useNow, useRuntime } from '@/components/protocol/provider'
import { AddressChip, DualMark, KV } from '@/components/ui/protocol-ui'
import { PayoffChart } from '@/components/ticket/payoff-chart'
import { Pill } from '@/components/ui/primitives'
import { SampleSeries } from '@/components/receipts/sample-series'
import { Holdings } from '@/components/portfolio/holdings'
import {
  fixedToNumber,
  formatMicroPrice,
  formatPct,
  formatUsdg,
  usdgToNumber,
} from '@/lib/protocol/fixed'
import { zeroEquityPrice } from '@/lib/protocol/payoff'
import type { Position, PositionStatus } from '@/lib/protocol/types'
import { resolveAsset } from '@/lib/universe'
import { useDuration, useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const STATUS_TONE: Record<PositionStatus, 'long' | 'short' | 'warn' | 'neutral' | 'info'> = {
  OPEN: 'info',
  KNOCKED_OUT: 'short',
  PENDING_SETTLEMENT: 'warn',
  SETTLED: 'long',
  CLOSED: 'neutral',
}

function params(p: Position) {
  return {
    collateral: usdgToNumber(p.collateral),
    notional: usdgToNumber(p.notional),
    entry: fixedToNumber(p.entryPrice),
    cap: fixedToNumber(p.capPrice),
    barrier: fixedToNumber(p.barrierPrice),
  }
}

function useSymbol() {
  const rt = useRuntime()
  return (address: string) => rt?.paper?.symbolOf(address) ?? resolveAsset(address)?.symbol ?? address.slice(0, 8)
}

function Detail({ p }: { p: Position }) {
  const { t } = useT()
  const rt = useRuntime()
  const samples = useAdapterQuery((a) => a.positionSamples(p.id), [p.id], { everyMs: 10_000 })
  const pp = params(p)
  const gross = p.currentValue - p.collateral
  const open = p.status === 'OPEN'
  const symbol = useSymbol()(p.token)

  return (
    <div className="grid gap-4 border-t border-line bg-sunken p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <PayoffChart
          params={pp}
          capPct={pp.cap / pp.entry}
          barrierPct={pp.barrier / pp.entry}
          dailyPremium={0}
          accruedPremium={usdgToNumber(p.accruedPremium)}
          markMovePct={fixedToNumber(p.settlementMark) / pp.entry - 1}
          compact
        />
        <div className="flex flex-col">
          <KV label={t('positions.collateral')}>{formatUsdg(p.collateral)}</KV>
          <KV label={t('positions.notional')}>{formatUsdg(p.notional)}</KV>
          <KV label={t('positions.value')}>{formatUsdg(p.currentValue)}</KV>
          <KV label={t('positions.col.premium')}>{formatUsdg(-p.accruedPremium)}</KV>
          <KV label={t('positions.col.equity')} hint={t('positions.equityHint')}>
            {formatUsdg(p.equity)}
          </KV>
          <KV label={t('positions.grossPnl')} hint={t('positions.grossHint')}>
            <span className={gross >= 0n ? 'text-long' : 'text-short'}>{formatUsdg(gross, { signed: true })}</span>
          </KV>
          <KV label={t('ticket.cap')}>{formatMicroPrice(p.capPrice)}</KV>
          <KV label={t('ticket.barrier')}>{formatMicroPrice(p.barrierPrice)}</KV>
          <KV label={t('positions.knockoutMark')} hint={t('positions.knockoutHint')}>
            {formatMicroPrice(p.knockoutMark)}
          </KV>
          <KV label={t('positions.opened')}>{new Date(p.openedAt).toLocaleString()}</KV>
        </div>
        <AddressChip address={p.token} head={10} tail={8} />
        {open && rt?.paper && (
          <div className="rounded-[12px] border border-dashed border-line-strong p-2">
            <p className="mb-1.5 text-micro text-ink-4">{t('positions.paperShockHint')}</p>
            <div className="flex flex-wrap gap-1.5">
              {[0.6, 0.85, 1.2, 1.6].map((f) => (
                <button
                  key={f}
                  onClick={() => rt.paper!.shock(p.token, f)}
                  className="flex items-center gap-1 rounded-[12px] border border-line px-2 py-1 text-micro font-semibold text-ink-2 hover:bg-raised"
                  title={t('positions.paperShock')}
                >
                  <Zap size={10} /> {symbol} {formatPct(f - 1, 0, true)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div>
          <p className="text-mini font-semibold text-ink">{t('positions.samples')}</p>
          <p className="text-micro text-ink-4">{t('positions.samplesHint')}</p>
        </div>
        {samples.data ? <SampleSeries samples={samples.data} /> : <p className="text-micro text-ink-4">{t('common.loading')}</p>}
      </div>
    </div>
  )
}

export function PositionList({ positions, compact = false }: { positions: Position[]; compact?: boolean }) {
  const { t } = useT()
  const rt = useRuntime()
  const now = useNow()
  const duration = useDuration()
  const symbolOf = useSymbol()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)

  const rows = useMemo(() => positions, [positions])

  const close = async (id: string) => {
    if (!rt) return
    setClosing(id)
    try {
      await rt.adapter.closePosition(id)
    } finally {
      setClosing(null)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="h-[var(--head-h)] border-b border-line mono text-[9.5px] font-medium text-ink-3">
            <th className="w-6 px-2" />
            <th className="px-2 text-left">{t('positions.col.token')}</th>
            <th className="px-2 text-right">{t('positions.col.entry')}</th>
            <th className="px-2 text-right" title={t('positions.settlementHint')}>
              {t('positions.col.settlement')}
            </th>
            <th className="px-2 text-right">{t('positions.col.barrier')}</th>
            {!compact && <th className="px-2 text-right">{t('positions.col.premium')}</th>}
            <th className="px-2 text-right" title={t('positions.runwayHint')}>
              {t('positions.col.runway')}
            </th>
            <th className="px-2 text-right" title={t('positions.equityHint')}>
              {t('positions.col.equity')}
            </th>
            <th className="px-2 text-right">{t('positions.col.pnl')}</th>
            <th className="px-2 pr-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const open = p.status === 'OPEN'
            const pp = params(p)
            const effective = zeroEquityPrice(pp, usdgToNumber(p.accruedPremium))
            const eligible = now >= p.payoutEligibleAt
            const extended = p.windowExtendedUntil !== null && now < p.windowExtendedUntil
            const danger = open && p.distanceToBarrierPct < 0.1
            const isOpen = expanded === p.id

            return (
              <Fragment key={p.id}>
                <tr
                  className={cn(
                    'border-b border-line/60 align-middle transition-colors hover:bg-raised',
                    danger && 'bg-short/[0.07]',
                  )}
                >
                  <td className="px-2">
                    <button
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                      aria-expanded={isOpen}
                      aria-label={t('positions.detail')}
                      className="grid size-5 place-items-center text-ink-3 hover:text-ink"
                    >
                      <ChevronDown size={13} className={cn('transition-transform', isOpen && 'rotate-180')} />
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5">
                        <Link href={`/t/${symbolOf(p.token)}`} className="text-xs font-semibold text-ink hover:text-accent">
                          {symbolOf(p.token)}
                        </Link>
                        <Pill tone={STATUS_TONE[p.status]}>{t(`positions.status.${p.status}` as MessageKey)}</Pill>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {open && !eligible && (
                          <Pill tone="info" title={t('ticket.payoutEligibleHint')}>
                            {t('positions.badge.notEligible', { time: duration(p.payoutEligibleAt - now) })}
                          </Pill>
                        )}
                        {extended && (
                          <Pill tone="warn" title={p.windowExtensionReason}>
                            {t('positions.badge.windowExtended')}
                          </Pill>
                        )}
                        {p.status === 'PENDING_SETTLEMENT' && <Pill tone="warn">{t('positions.badge.pending')}</Pill>}
                      </span>
                    </div>
                  </td>
                  <td className="num px-2 text-right text-mini text-ink-2">{formatMicroPrice(p.entryPrice)}</td>
                  <td className="px-2 text-right">
                    <DualMark settlement={p.settlementMark} spot={p.spotPrice} />
                  </td>
                  <td className="px-2 text-right">
                    {open ? (
                      <span className="inline-flex flex-col items-end leading-tight">
                        <span className={cn('num text-xs font-semibold', danger ? 'text-short' : 'text-ink')}>
                          {formatPct(p.distanceToBarrierPct, 1)}
                        </span>
                        <span className="num text-micro text-ink-4" title={t('positions.effectiveBarrierHint')}>
                          {t('positions.effectiveBarrier')} {formatMicroPrice(effective)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-micro text-ink-4">—</span>
                    )}
                  </td>
                  {!compact && (
                    <td className="num px-2 text-right text-mini text-warn">{formatUsdg(-p.accruedPremium)}</td>
                  )}
                  <td className="num px-2 text-right text-mini text-ink-2">
                    {open && Number.isFinite(p.premiumRunwayDays)
                      ? t('positions.runwayDays', { days: Math.floor(p.premiumRunwayDays) })
                      : '—'}
                  </td>
                  <td className="num px-2 text-right text-xs font-semibold text-ink">{formatUsdg(p.equity)}</td>
                  <td className={cn('num px-2 text-right text-xs font-semibold', p.pnl >= 0n ? 'text-long' : 'text-short')}>
                    {formatUsdg(p.pnl, { signed: true })}
                  </td>
                  <td className="px-2 pr-3 text-right">
                    {open ? (
                      <button
                        onClick={() => close(p.id)}
                        disabled={closing === p.id}
                        title={!eligible ? t('positions.closeEarly') : undefined}
                        className="h-7 rounded-[12px] border border-line-strong px-2.5 text-micro font-semibold text-ink-2 hover:bg-raised hover:text-ink disabled:opacity-50"
                      >
                        {closing === p.id ? t('positions.closing') : t('positions.close')}
                      </button>
                    ) : p.status === 'PENDING_SETTLEMENT' ? null : (
                      <Link
                        href={`/receipts/${p.id}`}
                        className="inline-flex h-7 items-center gap-1 rounded-[12px] border border-line px-2.5 text-micro font-semibold text-info hover:bg-raised"
                      >
                        <FileText size={11} /> {t('positions.receipt')}
                      </Link>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={compact ? 9 : 10} className="p-0">
                      <Detail p={p} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PositionsScreen() {
  const { t } = useT()
  const positions = useAdapterQuery((a) => a.listPositions(), [], { everyMs: 2000 })
  const [tab, setTab] = useState<'open' | 'closed' | 'portfolio'>('open')
  const all = positions.data ?? []
  const open = all.filter((p) => p.status === 'OPEN' || p.status === 'PENDING_SETTLEMENT')
  const closed = all.filter((p) => !(p.status === 'OPEN' || p.status === 'PENDING_SETTLEMENT'))
  const shown = tab === 'open' ? open : closed
  const holdings = useAdapterQuery((a) => a.listHoldings(), [], { everyMs: 3000 })
  const held = holdings.data?.length ?? 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-3 sm:p-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[clamp(26px,2.8vw,38px)] font-semibold leading-tight tracking-[-0.02em]">{t('positions.title')}</h1>
          <div className="seg">
            {(['open', 'closed', 'portfolio'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                aria-pressed={tab === k}
                className={cn(
                  'px-3 py-1 text-mini font-semibold transition-colors',
                  tab === k ? 'bg-ink text-void' : 'text-ink-3 hover:text-ink',
                )}
              >
                {t(`positions.${k}` as MessageKey)} <span className="num opacity-60">{k === 'open' ? open.length : k === 'closed' ? closed.length : held}</span>
              </button>
            ))}
          </div>
        </header>

        {tab === 'portfolio' ? (
          <Holdings />
        ) : (
        <section className="panel">
          {positions.loading && !positions.data ? (
            <p className="p-8 text-center mono text-[10px] text-ink-3">{t('common.loading')}</p>
          ) : shown.length ? (
            <PositionList positions={shown} />
          ) : (
            <div className="grid place-items-center gap-2 px-4 py-16 text-center">
              <p className="text-sm text-ink-2">{t('positions.empty')}</p>
              <p className="text-mini text-ink-4">{t('positions.emptyHint')}</p>
              <Link
                href="/"
                className="mt-2 btn-primary px-4 py-2 text-xs"
              >
                {t('positions.browse')}
              </Link>
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  )
}
