'use client'

/**
 * Spot portfolio: the tokens held, and the fills that built it.
 *
 * Cost basis is what was paid, fee included, reduced pro rata on each sell —
 * so the PnL shown is against the money actually spent, not against a
 * reference price.
 */

import Link from 'next/link'
import { useAdapterQuery } from '@/components/protocol/provider'
import { Pill } from '@/components/ui/primitives'
import { formatMicroPrice, formatPct, formatTokenAmount, formatUsdg, usdgToNumber } from '@/lib/protocol/fixed'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const TH = 'mono px-3 text-[10px] font-medium text-ink-3'

export function Holdings() {
  const { t } = useT()
  const holdings = useAdapterQuery((a) => a.listHoldings(), [], { everyMs: 2000 })
  const trades = useAdapterQuery((a) => a.listTrades(), [], { everyMs: 3000 })
  const rows = holdings.data ?? []
  const fills = (trades.data ?? []).slice(0, 50)

  return (
    <div className="flex flex-col gap-3">
      <section className="panel overflow-hidden">
        <header className="flex h-[var(--head-h)] items-center border-b border-line px-4">
          <h2 className="font-display text-sm font-semibold">{t('portfolio.holdings')}</h2>
        </header>
        {rows.length === 0 ? (
          <div className="grid place-items-center gap-1 px-4 py-14 text-center">
            <p className="text-sm text-ink-2">{t('portfolio.empty')}</p>
            <p className="text-mini text-ink-3">{t('portfolio.emptyHint')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="h-10 border-b border-line text-left">
                  <th className={TH}>{t('portfolio.col.token')}</th>
                  <th className={cn(TH, 'text-right')}>{t('portfolio.col.amount')}</th>
                  <th className={cn(TH, 'text-right')}>{t('portfolio.col.avg')}</th>
                  <th className={cn(TH, 'text-right')}>{t('portfolio.col.spot')}</th>
                  <th className={cn(TH, 'text-right')}>{t('portfolio.col.value')}</th>
                  <th className={cn(TH, 'text-right')}>{t('portfolio.col.pnl')}</th>
                  <th className="w-[92px]" />
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => {
                  const pct = h.costBasis > 0n ? usdgToNumber(h.pnl) / usdgToNumber(h.costBasis) : 0
                  const tone = h.pnl > 0n ? 'text-long' : h.pnl < 0n ? 'text-short' : 'text-ink-2'
                  return (
                    <tr key={h.token} className="h-[var(--row-h)] border-b border-line/60 last:border-0">
                      <td className="px-3 text-sm font-semibold">{h.symbol}</td>
                      <td className="num px-3 text-right text-xs">{formatTokenAmount(h.amount)}</td>
                      <td className="num px-3 text-right text-xs text-ink-2">{formatMicroPrice(h.avgPrice)}</td>
                      <td className="num px-3 text-right text-xs text-ink-2">{formatMicroPrice(h.spotPrice)}</td>
                      <td className="num px-3 text-right text-xs font-semibold">{formatUsdg(h.value)}</td>
                      <td className={cn('num px-3 text-right text-xs font-semibold', tone)}>
                        {formatUsdg(h.pnl, { signed: true })}
                        <span className="ml-1.5 font-normal opacity-70">{formatPct(pct, 1, true)}</span>
                      </td>
                      <td className="px-3 text-right">
                        <Link href={`/t/${h.symbol}`} className="btn-ghost inline-flex h-7 items-center px-3 text-micro font-semibold text-ink">
                          {t('list.open')}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <header className="flex h-[var(--head-h)] items-center border-b border-line px-4">
          <h2 className="font-display text-sm font-semibold">{t('portfolio.trades')}</h2>
        </header>
        {fills.length === 0 ? (
          <p className="px-4 py-10 text-center text-mini text-ink-3">{t('portfolio.tradesEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="h-10 border-b border-line text-left">
                  <th className={TH}>{t('portfolio.col.time')}</th>
                  <th className={TH}>{t('portfolio.col.side')}</th>
                  <th className={TH}>{t('portfolio.col.token')}</th>
                  <th className={cn(TH, 'text-right')}>{t('portfolio.col.amount')}</th>
                  <th className={cn(TH, 'text-right')}>{t('portfolio.col.price')}</th>
                  <th className={cn(TH, 'text-right')}>{t('portfolio.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {fills.map((f) => (
                  <tr key={f.id} className="h-10 border-b border-line/60 last:border-0">
                    <td className="num px-3 text-micro text-ink-3">{new Date(f.time).toLocaleTimeString()}</td>
                    <td className="px-3">
                      <Pill tone={f.side === 'buy' ? 'long' : 'short'}>{t(f.side === 'buy' ? 'trade.buy' : 'trade.sell')}</Pill>
                    </td>
                    <td className="px-3 text-xs font-semibold">{f.symbol}</td>
                    <td className="num px-3 text-right text-xs">{formatTokenAmount(f.tokenAmount)}</td>
                    <td className="num px-3 text-right text-xs text-ink-2">{formatMicroPrice(f.price)}</td>
                    <td className="num px-3 text-right text-xs font-semibold">{formatUsdg(f.usdgAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
