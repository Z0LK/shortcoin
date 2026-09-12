'use client'

/**
 * Token sheet — SPEC §4A, the central screen.
 *
 * Left: identity, address, pool depth, status with its reason, the price chart
 * with both TWAPs over the spot. Right: the opening ticket.
 *
 * On a phone the ticket comes straight after the identity block, before the
 * chart: launchpad traders are on their phones (§7.9), and the action they came
 * for should not sit below a chart they have to scroll past.
 *
 * A valid address that is not tracked still gets a sheet — identity as the
 * chain reports it, the UNTRACKED status, and a way to ask for it to be added.
 * "Not found" is never the answer to a real contract.
 */

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send } from 'lucide-react'
import { useAdapterQuery, useRuntime } from '@/components/protocol/provider'
import { AddressChip, StatusBadge } from '@/components/ui/protocol-ui'
import { TwapChart, type ChartLevel } from '@/components/token/twap-chart'
import { OpenTicket } from '@/components/ticket/open-ticket'
import { PositionList } from '@/components/positions/position-list'
import { Pill } from '@/components/ui/primitives'
import {
  fixedToNumber,
  formatBps,
  formatMicroPrice,
  formatPct,
  formatUsdgCompact,
} from '@/lib/protocol/fixed'
import type { Address, SearchResult, TokenRow } from '@/lib/protocol/types'
import { resolveAsset } from '@/lib/universe'
import { useDuration, useT } from '@/lib/i18n'

function Fact({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[3px] border border-line bg-sunken px-2.5 py-2" title={hint}>
      <span className="mono text-[9.5px] font-medium text-ink-3">{label}</span>
      <span className="num text-[13px] text-ink">{children}</span>
    </div>
  )
}

function Identity({ row }: { row: TokenRow }) {
  const { t } = useT()
  const duration = useDuration()
  const asset = resolveAsset(row.symbol)

  return (
    <section className="panel flex flex-col gap-3 p-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="num grid size-12 shrink-0 place-items-center rounded-[4px] text-sm text-[#07060f] "
          style={{ background: `hsl(${asset?.logoHue ?? 200} 58% 60%)` }}
        >
          {row.symbol.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-[-0.01em]">{row.symbol}</h1>
            <span className="truncate text-xs text-ink-3">{row.name}</span>
          </div>
          <AddressChip address={row.address} head={10} tail={8} className="mt-1" />
        </div>
      </div>

      <StatusBadge info={row.status} row={row} detailed />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label={t('token.depth')}>{formatUsdgCompact(row.quoteDepth)}</Fact>
        <Fact label={t('token.spot')} hint={t('positions.spotHint')}>
          <span className="text-ink-3">{formatMicroPrice(row.spotPrice)}</span>
        </Fact>
        <Fact label={t('token.twap24')}>
          <span className="text-info">{formatMicroPrice(row.twap24h)}</span>
        </Fact>
        <Fact label={t('token.twap72')}>
          <span className="text-warn">{formatMicroPrice(row.twap72h)}</span>
        </Fact>
        <Fact label={t('token.remaining')}>{formatUsdgCompact(row.remainingNotional)}</Fact>
        <Fact label={t('token.utilization')}>{formatPct(row.utilization, 0)}</Fact>
        <Fact label={t('list.col.rate')}>{formatBps(row.dailyRateBps)}</Fact>
        <Fact label={t('token.lastSample')}>{duration(Date.now() - row.lastSampleAt)}</Fact>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-micro text-ink-3">
        <span>{t('token.concentration')}</span>
        <span className="num font-semibold text-ink">
          {formatPct(row.concentration.topClusterPct, 0)} / {formatPct(row.concentration.thresholdPct, 0)}
        </span>
        {row.concentration.source !== 'pipeline' && <Pill tone="warn">{t('token.concentration.mock')}</Pill>}
      </div>
    </section>
  )
}

function Untracked({ address }: { address: Address }) {
  const { t } = useT()
  const rt = useRuntime()
  const [requested, setRequested] = useState(false)
  const lookup = useAdapterQuery((a) => a.search(address), [address], { live: false })
  const hit = lookup.data?.find((r): r is Extract<SearchResult, { kind: 'untracked' }> => r.kind === 'untracked')

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-4 p-4">
      <Link href="/" className="flex items-center gap-1 text-mini text-ink-3 hover:text-ink">
        <ArrowLeft size={12} /> {t('token.back')}
      </Link>
      <section className="flex flex-col gap-3 panel p-4">
        <Pill tone="neutral" className="self-start">
          {t('status.UNTRACKED')}
        </Pill>
        {hit?.symbol && (
          <div>
            <p className="text-lg font-semibold">
              {hit.symbol} <span className="text-sm font-normal text-ink-3">{hit.name}</span>
            </p>
            <p className="text-micro text-ink-4">{t('search.onChain')}</p>
          </div>
        )}
        <AddressChip address={address} head={12} tail={10} />
        <h1 className="text-sm font-semibold">{t('search.untracked.title')}</h1>
        <p className="text-xs leading-relaxed text-ink-3">{t('search.untracked.body')}</p>
        <button
          onClick={async () => {
            await rt?.adapter.requestListing(address)
            setRequested(true)
          }}
          disabled={requested}
          className="flex h-10 items-center justify-center gap-2 rounded-[4px] border border-line-strong text-xs font-semibold hover:bg-raised disabled:border-long/40 disabled:text-long"
        >
          <Send size={13} />
          {requested ? t('search.untracked.requested') : t('search.untracked.request')}
        </button>
      </section>
    </div>
  )
}

export function TokenSheet({ keyOrAddress }: { keyOrAddress: string }) {
  const { t } = useT()
  const token = useAdapterQuery((a) => a.getToken(keyOrAddress), [keyOrAddress], { everyMs: 2000 })
  const positions = useAdapterQuery((a) => a.listPositions(), [])

  if (token.loading && !token.data) {
    return <div className="grid h-full place-items-center mono text-[10px] text-ink-3">{t('common.loading')}</div>
  }

  const row = token.data
  if (!row) {
    if (/^0x[0-9a-fA-F]{40}$/.test(keyOrAddress)) return <Untracked address={keyOrAddress.toLowerCase() as Address} />
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-ink-2">{t('token.notFound')}</p>
          <Link href="/" className="mt-2 inline-block text-mini text-info hover:underline">
            {t('token.back')}
          </Link>
        </div>
      </div>
    )
  }

  const asset = resolveAsset(row.symbol)
  const supply = asset && asset.price > 0 ? asset.marketCap / asset.price : 0
  const mine = (positions.data ?? []).filter((p) => p.token === row.address)
  const openOne = mine.find((p) => p.status === 'OPEN')
  const levels: ChartLevel[] = openOne
    ? [
        { price: fixedToNumber(openOne.entryPrice), label: 'P₀', tone: 'info' },
        { price: fixedToNumber(openOne.barrierPrice), label: t('ticket.barrier'), tone: 'short' },
        { price: fixedToNumber(openOne.capPrice), label: t('ticket.cap'), tone: 'long' },
      ]
    : []

  return (
    <div className="h-full overflow-y-auto">
      {/* One ticket, placed by the grid: after the identity on a phone, in its
          own column spanning the height on a desktop. Rendering it twice and
          hiding one would run two quote loops against the same capacity. */}
      {/* Rows size to their content; the last one absorbs the ticket's extra
          height, so the identity block never stretches into an empty band. */}
      <div className="grid gap-2 p-2 sm:gap-2.5 sm:p-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_auto_1fr]">
        <div className="lg:col-start-1 lg:row-start-1">
          <Identity row={row} />
        </div>
        <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <div className="lg:sticky lg:top-3">
            <OpenTicket token={row} />
          </div>
        </div>
        <div className="flex h-[440px] lg:col-start-1 lg:row-start-2 lg:h-[520px]">
          <TwapChart token={row.address} symbol={row.symbol} supply={supply} levels={levels} />
        </div>
        <div className="lg:col-start-1 lg:row-start-3">
          {mine.length > 0 && (
            <section className="panel">
              <PositionList positions={mine} compact />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
