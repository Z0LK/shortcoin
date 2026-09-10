'use client'

/**
 * Scanner query bar.
 *
 * The sector tabs are table stakes. The SHORT DESK segment on the right is the
 * editorial part: it is SHORTCOIN's own read on the tape, and it is the reason
 * a trader opens this screen instead of any other token scanner.
 */

import { Search, X, ArrowDown, ArrowUp } from 'lucide-react'
import { SECTORS } from '@/lib/assets'
import { Label } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { Sector } from '@/lib/types'

export type SectorTab = 'All' | 'Watchlist' | Sector

export type SortKey =
  | 'symbol'
  | 'price'
  | 'change1h'
  | 'change24h'
  | 'change7d'
  | 'volume24h'
  | 'liquidity'
  | 'marketCap'
  | 'holders'
  | 'shortInterest'
  | 'borrowFee'
  | 'fundingRate'

export type SortDir = 'asc' | 'desc'

/** The desk's three lenses on the market. */
export type Lens = 'all' | 'hard' | 'crowded'

/** Annualised borrow above which a name is genuinely expensive to be short. */
export const HARD_TO_BORROW = 0.15
/** Short interest above which the exit door is narrower than the crowd. */
export const CROWDED_SHORT = 0.45

export interface ScannerQuery {
  sector: SectorTab
  text: string
  lens: Lens
  sort: SortKey
  dir: SortDir
}

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'symbol', label: 'Token' },
  { key: 'price', label: 'Price' },
  { key: 'change1h', label: '1h change' },
  { key: 'change24h', label: '24h change' },
  { key: 'change7d', label: '7d change' },
  { key: 'volume24h', label: 'Volume' },
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'marketCap', label: 'Market cap' },
  { key: 'holders', label: 'Holders' },
  { key: 'shortInterest', label: 'Short interest' },
  { key: 'borrowFee', label: 'Borrow fee' },
  { key: 'fundingRate', label: 'Funding' },
]

const LENSES: { key: Lens; label: string; hint: string }[] = [
  { key: 'all', label: 'All', hint: 'Every listed token' },
  {
    key: 'hard',
    label: 'Hard to borrow',
    hint: `Annualised borrow above ${(HARD_TO_BORROW * 100).toFixed(0)}% — the short side is already paying up`,
  },
  {
    key: 'crowded',
    label: 'Crowded short',
    hint: `Short interest above ${(CROWDED_SHORT * 100).toFixed(0)}% of open interest — squeeze risk`,
  },
]

const TABS: SectorTab[] = ['All', 'Watchlist', ...SECTORS]

export function ScannerFilters({
  query,
  onChange,
  watchCount,
  counts,
}: {
  query: ScannerQuery
  onChange: (patch: Partial<ScannerQuery>) => void
  watchCount: number
  counts: { hard: number; crowded: number }
}) {
  return (
    <div className="flex h-[var(--subnav-h)] shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
      <div
        role="tablist"
        aria-label="Sector"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab) => {
          const active = query.sector === tab
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={active}
              onClick={() => onChange({ sector: tab })}
              className={cn(
                'shrink-0 rounded-[3px] px-2 py-1 text-mini font-medium whitespace-nowrap transition-colors',
                active ? 'bg-raised text-ink' : 'text-ink-3 hover:bg-raised/60 hover:text-ink-2',
              )}
            >
              {tab}
              {tab === 'Watchlist' && (
                <span className="num ml-1 text-micro text-ink-4">{watchCount}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="relative shrink-0">
        <Search
          size={12}
          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-4"
        />
        <input
          value={query.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Filter symbol or company"
          aria-label="Filter by symbol or company name"
          className="h-6 w-[190px] rounded-[5px] border border-line bg-sunken pr-6 pl-6 text-mini text-ink placeholder:text-ink-4 outline-hidden transition-colors focus:border-line-strong"
        />
        {query.text && (
          <button
            onClick={() => onChange({ text: '' })}
            aria-label="Clear filter"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink-2"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <label htmlFor="scanner-sort" className="sr-only">
          Sort by
        </label>
        <select
          id="scanner-sort"
          value={query.sort}
          onChange={(e) => onChange({ sort: e.target.value as SortKey })}
          className="h-6 rounded-[5px] border border-line bg-sunken px-1.5 text-mini text-ink-2 outline-hidden transition-colors hover:border-line-strong"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key} className="bg-surface text-ink">
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => onChange({ dir: query.dir === 'desc' ? 'asc' : 'desc' })}
          aria-label={query.dir === 'desc' ? 'Sort ascending' : 'Sort descending'}
          title={query.dir === 'desc' ? 'Highest first' : 'Lowest first'}
          className="grid size-6 shrink-0 place-items-center rounded-[5px] border border-line bg-sunken text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          {query.dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
        </button>
      </div>

      <div className="ml-1 flex shrink-0 items-center gap-2 border-l border-line pl-3">
        <Label className="hidden xl:block">Short desk</Label>
        <div
          role="radiogroup"
          aria-label="Short desk lens"
          className="flex h-6 items-center gap-[2px] rounded-[5px] border border-line bg-sunken p-[2px]"
        >
          {LENSES.map((l) => {
            const active = query.lens === l.key
            const count = l.key === 'hard' ? counts.hard : l.key === 'crowded' ? counts.crowded : 0
            return (
              <button
                key={l.key}
                role="radio"
                aria-checked={active}
                title={l.hint}
                onClick={() => onChange({ lens: l.key })}
                className={cn(
                  'flex h-full items-center gap-1 rounded-[3px] px-2 text-micro font-semibold whitespace-nowrap transition-colors',
                  active
                    ? l.key === 'all'
                      ? 'bg-raised text-ink'
                      : 'bg-short/12 text-short'
                    : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {l.label}
                {l.key !== 'all' && (
                  <span className={cn('num', active ? 'text-short/70' : 'text-ink-4')}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
