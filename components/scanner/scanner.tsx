'use client'

/**
 * The scanner.
 *
 * Sorting runs on the STATIC asset record, never on the live price. A table
 * that reorders itself while a pointer is travelling toward a row is a table
 * that costs people money.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import {
  CROWDED_SHORT,
  HARD_TO_BORROW,
  ScannerFilters,
  type ScannerQuery,
  type SortKey,
} from '@/components/scanner/scanner-filters'
import { ScannerRow } from '@/components/scanner/scanner-row'
import { Label, Pill } from '@/components/ui/primitives'
import {
  ASSETS,
  COIN_SECTORS,
  marketPhase,
  PHASE_LABEL,
  SECTORS,
  SHORT_CENSUS,
  tokenizationWindowOpen,
} from '@/lib/assets'
import { useStore } from '@/lib/store'
import { abbr, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset, MarketPhase } from '@/lib/types'

interface Column {
  key: SortKey | null
  label: string
  align: 'left' | 'right' | 'center'
  width?: string
  hint?: string
}

const COLUMNS: Column[] = [
  { key: null, label: '#', align: 'left', width: 'w-[54px]' },
  { key: 'symbol', label: 'TOKEN', align: 'left', width: 'w-[240px]' },
  { key: 'price', label: 'PRICE', align: 'right', width: 'w-[104px]' },
  { key: 'change1h', label: '1H', align: 'right', width: 'w-[74px]' },
  { key: 'change24h', label: '24H', align: 'right', width: 'w-[74px]' },
  { key: 'change7d', label: '7D', align: 'right', width: 'w-[74px]' },
  { key: 'volume24h', label: 'VOLUME', align: 'right', width: 'w-[92px]' },
  { key: 'liquidity', label: 'LIQUIDITY', align: 'right', width: 'w-[92px]' },
  { key: 'marketCap', label: 'MCAP', align: 'right', width: 'w-[92px]' },
  { key: 'holders', label: 'HOLDERS', align: 'right', width: 'w-[80px]' },
  {
    key: null,
    label: 'SHORT ROUTE',
    align: 'center',
    width: 'w-[112px]',
    hint: 'Whether this token can be shorted anywhere today, before SHORTCOIN.',
  },
  {
    key: 'shortInterest',
    label: 'SHORT INT',
    align: 'right',
    width: 'w-[96px]',
    hint: 'Share of open interest sitting on the short side.',
  },
  {
    key: 'borrowFee',
    label: 'BORROW',
    align: 'right',
    width: 'w-[84px]',
    hint: 'Annualised cost of being short this name.',
  },
  {
    key: 'fundingRate',
    label: 'FUNDING',
    align: 'right',
    width: 'w-[92px]',
    hint: 'Per 8h. Positive means longs pay shorts.',
  },
  { key: null, label: '', align: 'right', width: 'w-[92px]' },
]

const EQUITY_SECTORS = SECTORS.filter((s) => !COIN_SECTORS.includes(s))

const DEFAULT_QUERY: ScannerQuery = {
  cls: 'all',
  sector: 'All',
  text: '',
  lens: 'all',
  sort: 'volume24h',
  dir: 'desc',
}

function compare(a: Asset, b: Asset, key: SortKey): number {
  if (key === 'symbol') return a.symbol.localeCompare(b.symbol)
  return (a[key] as number) - (b[key] as number)
}

export function Scanner() {
  const [query, setQuery] = useState<ScannerQuery>(DEFAULT_QUERY)
  const watchlist = useStore((s) => s.watchlist)

  // Wall-clock state is resolved after mount so the server and the first client
  // render cannot disagree.
  const [phase, setPhase] = useState<MarketPhase | null>(null)
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null)
  useEffect(() => {
    const update = () => {
      setPhase(marketPhase())
      setWindowOpen(tokenizationWindowOpen())
    }
    update()
    const t = setInterval(update, 30_000)
    return () => clearInterval(t)
  }, [])

  const counts = useMemo(
    () => ({
      hard: ASSETS.filter((a) => a.borrowFee > HARD_TO_BORROW).length,
      crowded: ASSETS.filter((a) => a.shortInterest > CROWDED_SHORT).length,
      equity: SHORT_CENSUS.equities,
      coin: SHORT_CENSUS.coins,
    }),
    [],
  )

  // Sector tabs follow the asset class: "Memecoin" is meaningless while looking
  // at equities, and "Semiconductors" is meaningless while looking at coins.
  const sectorTabs = useMemo(
    () =>
      query.cls === 'coin' ? COIN_SECTORS : query.cls === 'equity' ? EQUITY_SECTORS : SECTORS,
    [query.cls],
  )

  const rows = useMemo(() => {
    const text = query.text.trim().toLowerCase()
    let pool = ASSETS

    if (query.cls !== 'all') pool = pool.filter((a) => a.assetClass === query.cls)

    if (query.sector === 'Watchlist') pool = pool.filter((a) => watchlist.includes(a.symbol))
    else if (query.sector !== 'All') pool = pool.filter((a) => a.sector === query.sector)

    if (query.lens === 'hard') pool = pool.filter((a) => a.borrowFee > HARD_TO_BORROW)
    else if (query.lens === 'crowded') pool = pool.filter((a) => a.shortInterest > CROWDED_SHORT)

    if (text) {
      pool = pool.filter(
        (a) => a.symbol.toLowerCase().includes(text) || a.name.toLowerCase().includes(text),
      )
    }

    const sorted = [...pool].sort((a, b) => compare(a, b, query.sort))
    return query.dir === 'desc' ? sorted.reverse() : sorted
  }, [query, watchlist])

  const totalVolume = useMemo(() => rows.reduce((s, a) => s + a.volume24h, 0), [rows])
  const noRoute = useMemo(() => rows.filter((a) => a.shortRoute === 'none').length, [rows])

  const toggleSort = (key: SortKey | null) => {
    if (!key) return
    setQuery((q) =>
      q.sort === key
        ? { ...q, dir: q.dir === 'desc' ? 'asc' : 'desc' }
        : { ...q, sort: key, dir: 'desc' },
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── market strip ─────────────────────────────────────────────────── */}
      <div className="flex h-11 shrink-0 items-center gap-5 border-b border-line bg-surface px-3">
        <span className="flex items-baseline gap-1.5">
          <span className="num text-sm font-semibold text-ink">{rows.length}</span>
          <Label>tokens</Label>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="num text-sm font-semibold text-ink">{usdAbbr(totalVolume)}</span>
          <Label>24h volume</Label>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="num text-sm font-semibold text-short">{noRoute}</span>
          <Label>with no short route</Label>
        </span>

        <span className="ml-auto flex items-center gap-3 text-mini">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'size-1.5 rounded-full bg-current',
                phase === 'open' && 'pulse-dot',
                phase === 'open' ? 'text-long' : phase ? 'text-warn' : 'text-ink-4',
              )}
            />
            <span className="text-ink-2">{phase ? PHASE_LABEL[phase] : '—'}</span>
          </span>
          {windowOpen === false && (
            <Pill
              tone="warn"
              title="Mint and burn only run Monday 02:00 CET to Saturday 02:00 CET. Outside that window no authorised participant can arbitrage the token back to the share, so it can drift from what it tracks."
            >
              MINT WINDOW CLOSED
            </Pill>
          )}
          <span className="text-ink-4">
            {SHORT_CENSUS.equities} stock tokens · {SHORT_CENSUS.coins} coins ·{' '}
            {SHORT_CENSUS.none} with no short route anywhere
          </span>
        </span>
      </div>

      <ScannerFilters
        query={query}
        onChange={(patch) => setQuery((q) => ({ ...q, ...patch }))}
        watchCount={watchlist.length}
        counts={counts}
        sectors={sectorTabs}
      />

      {/* ── table ────────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1180px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="h-[var(--head-h)] bg-surface">
              {COLUMNS.map((col, i) => {
                const active = col.key && query.sort === col.key
                return (
                  <th
                    key={`${col.label}-${i}`}
                    scope="col"
                    title={col.hint}
                    className={cn(
                      'border-b border-line px-2 text-micro font-semibold uppercase tracking-[0.08em]',
                      col.width,
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.align === 'left' && 'text-left',
                      active ? 'text-ink' : 'text-ink-4',
                      col.key && 'cursor-pointer select-none hover:text-ink-2',
                      i === COLUMNS.length - 1 && 'pr-3',
                    )}
                    onClick={() => toggleSort(col.key)}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1',
                        col.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {col.label}
                      {active &&
                        (query.dir === 'desc' ? <ArrowDown size={9} /> : <ArrowUp size={9} />)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((asset, i) => (
              <ScannerRow key={asset.symbol} asset={asset} index={i + 1} />
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="grid place-items-center py-24 text-center">
            <p className="text-xs text-ink-2">Nothing matches this filter.</p>
            <p className="mt-1 text-mini text-ink-4">
              Clear the search or switch back to the All lens.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
