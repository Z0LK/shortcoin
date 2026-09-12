'use client'

/**
 * The token list.
 *
 * SPEC §3: every row carries its eligibility status, remaining capacity and the
 * current daily rate; "openable now" is the default filter; the list sorts by
 * capacity and by rate. The address is on every row, copyable, because the
 * name alone never identifies a token on a launchpad.
 *
 * Coins have a second view — the live launch tape — which is the indexer's
 * "newest" query plus the launches it pushes. Almost everything on it is in
 * WARMUP by construction, so the openable filter does not apply there.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Search, Star, X } from 'lucide-react'
import { useAdapterQuery, useProtocolEvents, useRuntime } from '@/components/protocol/provider'
import { useLivePrice } from '@/components/market-provider'
import { AddressChip, StatusBadge, useStatusReason } from '@/components/ui/protocol-ui'
import { Label, Pill } from '@/components/ui/primitives'
import { formatBps, formatMicroPrice, formatPct, formatUsdgCompact, fixedToNumber } from '@/lib/protocol/fixed'
import type { TokenSort } from '@/lib/protocol/adapter'
import type { TokenRow } from '@/lib/protocol/types'
import { resolveAsset } from '@/lib/universe'
import { searchAssets } from '@/lib/search'
import { useStore } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { ageLabel, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'

type ClassTab = 'all' | 'watch'
type Feed = 'listed' | 'new'

const FEED_PAGE = 60
const MAX_FEED = 3000

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

/**
 * Everything a row or a card shows, derived once. The table and the mobile
 * cards read the same figures from here so the two layouts cannot disagree.
 */
function useRowView(row: TokenRow, bornAt?: number) {
  const asset = resolveAsset(row.symbol)
  const unit = useStore((s) => s.unit)
  const watched = useStore((s) => s.watchlist.includes(row.symbol))
  const toggleWatch = useStore((s) => s.toggleWatch)

  // Live spot ticks between list refreshes, so the price column is not a
  // photograph from five seconds ago.
  const live = useLivePrice({ symbol: row.symbol, price: asset?.price ?? fixedToNumber(row.spotPrice) })
  const spot = asset ? live.price : fixedToNumber(row.spotPrice)
  const supply = asset && asset.price > 0 ? asset.marketCap / asset.price : 0

  const remainingPct = 1 - row.utilization
  const age = bornAt ? (Date.now() - bornAt) / 3_600_000 : asset?.ageHours
  const priceText = unit === 'mcap' && supply > 0 ? usdAbbr(spot * supply) : formatMicroPrice(spot)
  // Literal class names, so Tailwind's scanner sees every one of them.
  const tone =
    remainingPct < 0.15
      ? { text: 'text-short', bg: 'bg-short' }
      : remainingPct < 0.35
        ? { text: 'text-warn', bg: 'bg-warn' }
        : { text: 'text-long', bg: 'bg-long' }

  return { asset, unit, watched, toggleWatch, live, remainingPct, age, priceText, tone }
}

const Row = memo(function Row({
  row,
  index,
  bornAt,
}: {
  row: TokenRow
  index: number
  bornAt?: number
}) {
  const { t } = useT()
  const { asset, watched, toggleWatch, live, remainingPct, age, priceText } = useRowView(row, bornAt)

  return (
    <tr className="group h-[var(--row-h)] border-b border-line/60 transition-colors hover:bg-raised">
      <td className="px-2 pl-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleWatch(row.symbol)}
            aria-pressed={watched}
            aria-label={row.symbol}
            className={cn(
              'grid size-4 place-items-center',
              watched ? 'text-warn' : 'text-ink-4 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            <Star size={11} fill={watched ? 'currentColor' : 'none'} />
          </button>
          <span className="num text-mini text-ink-4">{index}</span>
        </div>
      </td>

      <td className="px-2">
        <Link href={`/t/${row.symbol}`} className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="num grid size-7 shrink-0 place-items-center rounded-[12px] text-micro font-medium text-[#07060f] "
            style={{ background: `hsl(${asset?.logoHue ?? 200} 58% 60%)` }}
          >
            {row.symbol.slice(0, 2)}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink transition-colors group-hover:text-ink">
                {row.symbol}
              </span>
              {age !== undefined && (
                <Pill tone={age < 24 ? 'info' : 'neutral'} className="shrink-0">
                  {ageLabel(age)}
                </Pill>
              )}
            </span>
            <span className="truncate text-micro text-ink-3">{row.name}</span>
          </span>
        </Link>
      </td>

      <td className="hidden px-2 md:table-cell">
        <AddressChip address={row.address} head={6} tail={4} />
      </td>

      <td className="px-2">
        <StatusBadge info={row.status} row={row} />
      </td>

      <td className="px-2">
        <div className="flex min-w-[96px] flex-col gap-1">
          <span className="num flex justify-between text-mini">
            <span className={cn(remainingPct < 0.15 ? 'text-short' : remainingPct < 0.35 ? 'text-warn' : 'text-ink')}>
              {formatPct(remainingPct, 0)}
            </span>
            <span className="text-ink-4">{formatUsdgCompact(row.remainingNotional)}</span>
          </span>
          <div className="h-[3px] w-full overflow-hidden rounded-[12px] bg-line">
            <div
              className={cn('h-full', remainingPct < 0.15 ? 'bg-short' : remainingPct < 0.35 ? 'bg-warn' : 'bg-long')}
              style={{ width: `${remainingPct * 100}%` }}
            />
          </div>
        </div>
      </td>

      <td className="num px-2 text-right text-mini font-semibold text-ink">{formatBps(row.dailyRateBps)}</td>

      <td className="num hidden px-2 text-right text-mini text-ink-2 lg:table-cell">
        {formatUsdgCompact(row.quoteDepth)}
      </td>

      <td className="num hidden px-2 text-right text-mini sm:table-cell">
        <span
          key={live.seq}
          className={cn(
            'rounded-[12px] px-1.5 text-ink-2',
            live.dir > 0 && 'flash-up',
            live.dir < 0 && 'flash-down',
          )}
        >
          {priceText}
        </span>
      </td>

      <td className="px-2 pr-4 text-right">
        {row.status.canOpen ? (
          <Link
            href={`/t/${row.symbol}`}
            className="btn-ghost inline-flex h-7 items-center gap-1 px-2.5 text-micro font-semibold text-ink hover:bg-overlay"
          >
            {t('list.open')} <ArrowUpRight size={11} />
          </Link>
        ) : (
          <span
            title={row.status.reason}
            className="inline-flex h-7 cursor-not-allowed items-center rounded-[12px] border border-line px-3 text-micro font-semibold text-ink-4"
          >
            {t('list.open')}
          </span>
        )}
      </td>
    </tr>
  )
})


/**
 * The same row as a card, for phones (SPEC 7.9). One column, the status and
 * the remaining capacity readable at a glance, and a full-width button: a
 * 24px "Ouvrir" in a table cell is not a touch target.
 *
 * The card is not one big link. It holds the address chip's own copy and
 * explorer controls, and links cannot nest. Tapping anywhere else opens the
 * sheet.
 */
const Card = memo(function Card({ row, bornAt }: { row: TokenRow; bornAt?: number }) {
  const { t } = useT()
  const router = useRouter()
  const reason = useStatusReason(row)
  const { asset, unit, watched, toggleWatch, live, remainingPct, age, priceText, tone } = useRowView(row, bornAt)
  const href = `/t/${row.symbol}`

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
      className="panel panel-hover flex cursor-pointer flex-col gap-2.5 p-3 active:border-line-strong"
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="num grid size-10 shrink-0 place-items-center rounded-[12px] text-mini font-medium text-[#07060f] "
          style={{ background: `hsl(${asset?.logoHue ?? 200} 58% 60%)` }}
        >
          {row.symbol.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">{row.symbol}</span>
            {age !== undefined && (
              <Pill tone={age < 24 ? 'info' : 'neutral'} className="shrink-0">
                {ageLabel(age)}
              </Pill>
            )}
          </div>
          <p className="truncate text-mini text-ink-3">{row.name}</p>
          <AddressChip address={row.address} head={6} tail={4} className="mt-0.5" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleWatch(row.symbol)
            }}
            aria-pressed={watched}
            aria-label={row.symbol}
            className={cn('grid size-8 place-items-center rounded-[12px] border border-line', watched ? 'text-warn' : 'text-ink-4')}
          >
            <Star size={15} fill={watched ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <div className="-mt-1">
        <StatusBadge info={row.status} row={row} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-3 flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-micro">
            <span className="text-ink-4">{t('list.col.capacity')}</span>
            <span className="num">
              <span className={cn('font-semibold', tone.text)}>{formatPct(remainingPct, 0)}</span>
              <span className="text-ink-4"> · {formatUsdgCompact(row.remainingNotional)}</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-[12px] bg-line">
            <div className={cn('h-full', tone.bg)} style={{ width: `${remainingPct * 100}%` }} />
          </div>
        </div>
        <div>
          <p className="text-micro text-ink-4">{t('list.col.rate')}</p>
          <p className="num text-xs font-semibold text-ink">{formatBps(row.dailyRateBps)}</p>
        </div>
        <div>
          <p className="text-micro text-ink-4">{t('list.col.depth')}</p>
          <p className="num text-xs text-ink-2">{formatUsdgCompact(row.quoteDepth)}</p>
        </div>
        <div className="text-right">
          <p className="text-micro text-ink-4">{unit === 'mcap' ? 'MC' : t('list.col.spot')}</p>
          <p
            key={live.seq}
            className={cn(
              'num inline-block rounded-full px-1 text-xs text-ink-2',
              live.dir > 0 && 'flash-up',
              live.dir < 0 && 'flash-down',
            )}
          >
            {priceText}
          </p>
        </div>
      </div>

      {row.status.canOpen ? (
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="btn-primary flex h-11 items-center justify-center gap-1 text-xs"
        >
          {t('list.open')} <ArrowUpRight size={13} />
        </Link>
      ) : (
        <p className="rounded-[12px] border border-line px-3 py-2 text-center text-micro leading-snug text-ink-3">
          {reason}
        </p>
      )}
    </div>
  )
})

/** Phones get cards, everything wider gets the table, never both at once. */
function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return mobile
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function TokenList() {
  const { t } = useT()
  const rt = useRuntime()
  const unit = useStore((s) => s.unit)
  const watchlist = useStore((s) => s.watchlist)

  const [cls, setCls] = useState<ClassTab>('all')
  const [feed, setFeed] = useState<Feed>('listed')
  const [openableOnly, setOpenableOnly] = useState(true)
  const [sort, setSort] = useState<TokenSort>('capacity')
  const [text, setText] = useState('')

  const feedMode = feed === 'new'
  const isMobile = useIsMobile()

  // ── listed ─────────────────────────────────────────────────────────────
  const listed = useAdapterQuery((a) => a.listTokens({ sort }), [sort], { everyMs: 5000 })

  const rows = useMemo(() => {
    let out = listed.data ?? []
    if (cls === 'watch') out = out.filter((r) => watchlist.includes(r.symbol))
    if (openableOnly) out = out.filter((r) => r.status.canOpen)
    const q = text.trim()
    if (q) {
      const ranked = searchAssets(
        out.map((r) => resolveAsset(r.symbol)).filter((a): a is NonNullable<typeof a> => !!a),
        q,
        200,
      ).map((h) => h.asset.symbol)
      const bySymbol = new Map(out.map((r) => [r.symbol, r]))
      out = ranked.map((s) => bySymbol.get(s)!).filter(Boolean)
    }
    return out
  }, [listed.data, cls, watchlist, openableOnly, text])

  const totals = useMemo(() => {
    const all = listed.data ?? []
    return { total: all.length, openable: all.filter((r) => r.status.canOpen).length }
  }, [listed.data])

  // ── launch tape ────────────────────────────────────────────────────────
  const [tape, setTape] = useState<{ row: TokenRow; bornAt?: number }[]>([])
  const [liveCount, setLiveCount] = useState(0)
  const [live, setLive] = useState(true)
  const offset = useRef(0)

  useEffect(() => {
    if (!feedMode || !rt) return
    offset.current = FEED_PAGE
    setLiveCount(0)
    rt.adapter.listTokens({ newest: { offset: 0, limit: FEED_PAGE } }).then((r) => setTape(r.map((row) => ({ row }))))
  }, [feedMode, rt])

  useProtocolEvents((e) => {
    if (!feedMode || !live || e.type !== 'token.launched') return
    setTape((prev) => [{ row: e.token, bornAt: Date.now() }, ...prev].slice(0, MAX_FEED))
    setLiveCount((n) => n + 1)
  })

  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!feedMode || !rt || !sentinel.current) return
    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting) return
        const start = offset.current
        offset.current += FEED_PAGE
        const more = await rt.adapter.listTokens({ newest: { offset: start, limit: FEED_PAGE } })
        setTape((prev) => [...prev, ...more.map((row) => ({ row }))].slice(0, MAX_FEED))
      },
      { rootMargin: '600px' },
    )
    io.observe(sentinel.current)
    return () => io.disconnect()
  }, [feedMode, rt])

  // A second hand for the ages on live rows.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!feedMode) return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [feedMode])

  const SORTS: { key: TokenSort; label: string }[] = [
    { key: 'capacity', label: t('list.sortCapacity') },
    { key: 'rate', label: t('list.sortRate') },
    { key: 'depth', label: t('list.sortDepth') },
  ]

  const CLASSES: { key: ClassTab; label: string }[] = [
    { key: 'all', label: t('list.class.all') },
    { key: 'watch', label: '★' },
  ]

  const tab = (active: boolean) =>
    cn(
      'whitespace-nowrap px-3 py-1 text-mini font-semibold transition-colors',
      active ? 'bg-ink text-void' : 'text-ink-3 hover:text-ink',
    )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
      {/* ── headline ──────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-end gap-x-8 gap-y-3 px-1 pt-3">
        <div className="min-w-0">
          <p className="eyebrow">{t('home.kicker')}</p>
          <h1 className="font-display mt-2.5 text-[clamp(28px,3.4vw,48px)] font-semibold leading-[1.04] tracking-[-0.02em]">
            {t('home.title1')} <em className="spectrum-text not-italic">{t('home.title2')}</em>
          </h1>
          <p className="mt-2.5 max-w-[560px] text-sm text-ink-3">{t('home.tagline')}</p>
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="chip num">{t('list.count', { n: totals.total })}</span>
          <span className="chip num text-ink">
            <i aria-hidden className="spectrum-dot" />
            {t('list.openableCount', { n: totals.openable })}
          </span>
          {feedMode && (
            <button
              onClick={() => setLive(!live)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-mini font-semibold',
                live ? 'border-short/40 bg-short/10 text-short' : 'border-line text-ink-3',
              )}
            >
              <span className={cn('size-1.5 rounded-[12px] bg-current', live && 'pulse-dot')} />
              {live ? t('list.feed.live') : t('list.feed.paused')} · {liveCount} {t('list.feed.since')}
            </button>
          )}
        </span>
      </div>

      <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden max-md:border-0 max-md:bg-transparent">
      {/* ── filters ───────────────────────────────────────────────────── */}
      <div className="flex h-[var(--subnav-h)] shrink-0 items-center gap-2 overflow-x-auto border-b border-line [scrollbar-width:none] max-md:px-0 md:px-4">
        <div className="seg shrink-0">
          {CLASSES.map((c) => (
            <button key={c.key} onClick={() => setCls(c.key)} className={tab(cls === c.key)} aria-pressed={cls === c.key}>
              {c.label}
            </button>
          ))}
        </div>

        {cls !== 'watch' && (
          <div className="seg shrink-0">
            <button onClick={() => setFeed('listed')} className={tab(feed === 'listed')}>
              {t('list.feed.trending')}
            </button>
            <button onClick={() => setFeed('new')} className={cn(tab(feed === 'new'), 'flex items-center gap-1')}>
              <span className={cn('size-1.5 rounded-[12px]', feed === 'new' ? 'pulse-dot bg-current' : 'bg-ink-4')} />
              {t('list.feed.new')}
            </button>
          </div>
        )}

        {!feedMode && (
          <>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[12px] border border-line bg-black/30 px-3 py-[5px] text-mini font-semibold text-ink-2">
              <input
                type="checkbox"
                checked={openableOnly}
                onChange={(e) => setOpenableOnly(e.target.checked)}
                className="accent-[var(--sig)]"
              />
              {t('list.openableOnly')}
            </label>

            <div className="flex shrink-0 items-center gap-1.5">
              <Label>↕</Label>
              <div className="seg">
                {SORTS.map((s) => (
                  <button key={s.key} onClick={() => setSort(s.key)} className={tab(sort === s.key)} aria-pressed={sort === s.key}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative ml-auto shrink-0">
              <Search size={12} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('search.placeholder')}
                className="h-8 w-[220px] rounded-[12px] border border-line bg-black/30 pr-7 pl-8 text-mini text-ink placeholder:text-ink-4 outline-hidden transition-colors focus:border-line-strong"
              />
              {text && (
                <button onClick={() => setText('')} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-4" aria-label="clear">
                  <X size={11} />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── table, or cards on a phone ────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isMobile ? (
          <div className="flex flex-col gap-1.5 pb-3">
            {feedMode
              ? tape.map((item) => <Card key={item.row.address} row={item.row} bornAt={item.bornAt} />)
              : rows.map((row) => <Card key={row.address} row={row} />)}
          </div>
        ) : (
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="sticky top-0 z-10 bg-overlay">
            <tr className="mono h-[var(--head-h)] border-b border-line text-[9.5px] font-medium text-ink-3">
              <th className="w-[60px] px-2 pl-4 text-left">#</th>
              <th className="px-2 text-left">{t('list.col.token')}</th>
              <th className="hidden px-2 text-left md:table-cell">{t('list.col.address')}</th>
              <th className="px-2 text-left">{t('list.col.status')}</th>
              <th className={cn('w-[130px] px-2 text-left', sort === 'capacity' && !feedMode && 'text-ink')}>
                {t('list.col.capacity')}
              </th>
              <th className={cn('px-2 text-right', sort === 'rate' && !feedMode && 'text-ink')}>{t('list.col.rate')}</th>
              <th className={cn('hidden px-2 text-right lg:table-cell', sort === 'depth' && !feedMode && 'text-ink')}>
                {t('list.col.depth')}
              </th>
              <th className="hidden px-2 text-right sm:table-cell">{unit === 'mcap' ? 'MC' : t('list.col.spot')}</th>
              <th className="w-[96px] px-2" />
            </tr>
          </thead>
          <tbody>
            {feedMode
              ? tape.map((item, i) => <Row key={item.row.address} row={item.row} index={i + 1} bornAt={item.bornAt} />)
              : rows.map((row, i) => <Row key={row.address} row={row} index={i + 1} />)}
          </tbody>
        </table>
        )}

        {feedMode && (
          <div ref={sentinel} className="flex h-14 items-center justify-center mono text-[10px] text-ink-3">
            {t('list.feed.loading')}
          </div>
        )}

        {!feedMode && !listed.loading && rows.length === 0 && (
          <div className="grid place-items-center py-20 text-center">
            <p className="text-xs text-ink-2">{t('list.empty')}</p>
            {openableOnly && <p className="mt-1 text-mini text-ink-4">{t('list.emptyHint')}</p>}
          </div>
        )}

        {!feedMode && listed.loading && (
          <div className="grid place-items-center py-20 mono text-[10px] text-ink-3">
            {t('common.loading')}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
