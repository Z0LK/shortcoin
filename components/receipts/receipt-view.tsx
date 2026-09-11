'use client'

/**
 * Settlement and knock-out receipt — SPEC §4C.
 *
 * The screen that decides whether people trust the product. A knocked-out user
 * will dispute it, and this page has to settle the dispute on its own: the
 * timestamped series that produced the triggering TWAP, which of the two TWAPs
 * fired and its exact value at the crossing, the knock-out transaction hash and
 * the keeper that sent it, and the arithmetic from collateral to payout.
 *
 * Exportable, as JSON and CSV. These are the proof of settlement, not a
 * decorative history.
 */

import Link from 'next/link'
import { ArrowLeft, Download } from 'lucide-react'
import { useAdapterQuery, useRuntime } from '@/components/protocol/provider'
import { AddressChip, KV } from '@/components/ui/protocol-ui'
import { SampleSeries } from '@/components/receipts/sample-series'
import { Pill } from '@/components/ui/primitives'
import { CHAIN } from '@/lib/assets'
import { formatMicroPrice, formatUsdg } from '@/lib/protocol/fixed'
import type { SettlementReceipt } from '@/lib/protocol/types'
import { resolveAsset } from '@/lib/universe'
import { useT, type MessageKey } from '@/lib/i18n'

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function toJson(r: SettlementReceipt) {
  return JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
}

function toCsv(r: SettlementReceipt) {
  const head = [
    `# positionId,${r.positionId}`,
    `# trigger,${r.trigger}`,
    `# triggeredBy,${r.triggeredBy}`,
    `# triggerPrice_1e18,${r.triggerPrice}`,
    `# txHash,${r.txHash}`,
    `# keeper,${r.keeper}`,
    `# collateral_usdg_base,${r.collateral}`,
    `# premiumPaid_usdg_base,${r.premiumPaid}`,
    `# payout_usdg_base,${r.payout}`,
    'timestamp_iso,timestamp_ms,price_1e18',
  ]
  return [...head, ...r.samples.map((s) => `${new Date(s.at).toISOString()},${s.at},${s.price}`)].join('\n')
}

export function ReceiptView({ positionId }: { positionId: string }) {
  const { t } = useT()
  const rt = useRuntime()
  const receipt = useAdapterQuery((a) => a.getReceipt(positionId), [positionId], { live: false })
  const position = useAdapterQuery((a) => a.getPosition(positionId), [positionId], { live: false })

  const r = receipt.data
  const p = position.data
  const symbol = p ? (rt?.paper?.symbolOf(p.token) ?? resolveAsset(p.token)?.symbol ?? '') : ''

  if (receipt.loading) {
    return <div className="grid h-full place-items-center mono text-[10px] text-ink-3">{t('common.loading')}</div>
  }
  if (!r) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-ink-2">{t('receipt.notFound')}</p>
          <Link href="/positions" className="mt-2 inline-block text-mini text-info hover:underline">
            {t('nav.positions')}
          </Link>
        </div>
      </div>
    )
  }

  const tone = r.trigger === 'KNOCKOUT' ? 'short' : r.trigger === 'CAP_REACHED' ? 'long' : 'neutral'
  const net = r.payout - r.collateral

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[980px] flex-col gap-4 p-3 sm:p-6">
        <Link href="/positions" className="flex items-center gap-1 text-mini text-ink-3 hover:text-ink">
          <ArrowLeft size={12} /> {t('nav.positions')}
        </Link>

        <header className="flex flex-wrap items-center gap-3">
          <h1 className="display text-[clamp(1.7rem,4vw,2.6rem)] text-glow">{t('receipt.title')}</h1>
          <Pill tone={tone}>{t(`receipt.trigger.${r.trigger}` as MessageKey)}</Pill>
          {symbol && <span className="text-sm font-semibold text-ink-2">{symbol}</span>}
          <span className="num text-micro text-ink-4">{r.positionId}</span>
          <div className="ml-auto flex gap-1.5">
            <button
              onClick={() => download(`receipt-${r.positionId}.json`, 'application/json', toJson(r))}
              className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-micro font-semibold text-ink-2 hover:bg-raised"
            >
              <Download size={11} /> {t('receipt.export.json')}
            </button>
            <button
              onClick={() => download(`receipt-${r.positionId}.csv`, 'text/csv', toCsv(r))}
              className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-micro font-semibold text-ink-2 hover:bg-raised"
            >
              <Download size={11} /> {t('receipt.export.csv')}
            </button>
          </div>
        </header>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <section className="flex flex-col gap-3 glass p-3">
            <div className="flex flex-col">
              <KV label={t('receipt.triggeredBy')}>
                <span className="font-semibold">{r.triggeredBy === 'TWAP24' ? t('token.twap24') : t('token.twap72')}</span>
              </KV>
              <KV label={t('receipt.triggerPrice')}>{formatMicroPrice(r.triggerPrice)}</KV>
              {p && <KV label={t('receipt.barrier')}>{formatMicroPrice(p.barrierPrice)}</KV>}
            </div>

            <div>
              <p className="mb-1 mono text-[9.5px] font-medium text-ink-3">{t('receipt.breakdown')}</p>
              <KV label={t('receipt.collateral')}>{formatUsdg(r.collateral)}</KV>
              <KV label={t('receipt.premium')}>{formatUsdg(-r.premiumPaid)}</KV>
              <KV label={t('receipt.payout')}>
                <span className="font-semibold">{formatUsdg(r.payout)}</span>
              </KV>
              <KV label={t('positions.col.pnl')}>
                <span className={net >= 0n ? 'text-long' : 'text-short'}>{formatUsdg(net, { signed: true })}</span>
              </KV>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line pt-2">
              <p className="mono text-[9.5px] font-medium text-ink-3">{t('receipt.tx')}</p>
              <a
                href={`${CHAIN.explorer}/tx/${r.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="num break-all text-micro text-info hover:underline"
              >
                {r.txHash}
              </a>
              <p className="mt-1 mono text-[9.5px] font-medium text-ink-3">{t('receipt.keeper')}</p>
              <AddressChip address={r.keeper} head={10} tail={8} />
            </div>

            <p className="rounded-lg border border-line bg-sunken p-2 text-micro leading-relaxed text-ink-3">
              {t('receipt.whyTwap')}
            </p>
          </section>

          <section className="flex min-w-0 flex-col gap-2 glass p-3">
            <div>
              <p className="text-mini font-semibold text-ink">{t('receipt.samples', { n: r.samples.length })}</p>
              <p className="text-micro text-ink-4">{t('receipt.samplesHint')}</p>
            </div>
            <SampleSeries
              samples={r.samples}
              threshold={r.trigger === 'KNOCKOUT' ? p?.barrierPrice : r.trigger === 'CAP_REACHED' ? p?.capPrice : undefined}
              thresholdLabel={r.trigger === 'KNOCKOUT' ? t('receipt.barrier') : r.trigger === 'CAP_REACHED' ? t('ticket.cap') : undefined}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
