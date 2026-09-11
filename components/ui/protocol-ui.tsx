'use client'

/**
 * Building blocks every protocol screen shares.
 *
 * Each of these encodes a rule from the spec so no screen has to remember it:
 *   <AddressChip>  — the address is visible, copyable in one click, and links
 *                    to the explorer, everywhere a token appears (§3)
 *   <StatusBadge>  — a status always carries its reason, and a countdown when
 *                    the status is timed (§5, §6)
 *   <DualMark>     — on a position, the settlement price leads and the spot
 *                    trails, greyed, with the one sentence explaining why (§5)
 *   <Countdown>    — a countdown that re-renders itself and never goes negative
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink, Info } from 'lucide-react'
import { CHAIN } from '@/lib/assets'
import { formatMicroPrice, formatPct, formatUsdgCompact } from '@/lib/protocol/fixed'
import { STATUS_RULES } from '@/lib/protocol/status'
import type { TokenRow, TokenStatusInfo } from '@/lib/protocol/types'
import { useDuration, useT, type MessageKey } from '@/lib/i18n'
import { useNow } from '@/components/protocol/provider'
import { Pill } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export function shortAddr(address: string, head = 6, tail = 4) {
  return address.length <= head + tail + 2 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`
}

export function AddressChip({
  address,
  className,
  head = 6,
  tail = 4,
}: {
  address: string
  className?: string
  head?: number
  tail?: number
}) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(id)
  }, [copied])

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="num text-mini text-ink-3" title={address}>
        {shortAddr(address, head, tail)}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          navigator.clipboard?.writeText(address).then(() => setCopied(true))
        }}
        aria-label={copied ? t('address.copied') : t('address.copy')}
        title={copied ? t('address.copied') : t('address.copy')}
        className="grid size-5 place-items-center rounded-md text-ink-4 transition-colors hover:bg-raised hover:text-ink-2"
      >
        {copied ? <Check size={11} className="text-long" /> : <Copy size={11} />}
      </button>
      <a
        href={`${CHAIN.explorer}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label={t('address.explorer')}
        title={t('address.explorer')}
        className="grid size-5 place-items-center rounded-md text-ink-4 transition-colors hover:bg-raised hover:text-info"
      >
        <ExternalLink size={10} />
      </a>
    </span>
  )
}

export function Countdown({ until, className }: { until: number; className?: string }) {
  const now = useNow()
  const duration = useDuration()
  return <span className={cn('num', className)}>{duration(until - now)}</span>
}

/** The localised reason for a token's status, filled with its real figures. */
export function useStatusReason(row: TokenRow): string {
  const { t } = useT()
  const duration = useDuration()
  const localised = t(`status.${row.status.status}.reason` as MessageKey, {
    pct: formatPct(row.concentration.topClusterPct, 0),
    threshold: formatPct(row.concentration.thresholdPct, 0),
    depth: formatUsdgCompact(row.quoteDepth),
    age: duration(Date.now() - row.lastSampleAt),
  })
  return /\{\w+\}/.test(localised) ? row.status.reason : localised
}

/**
 * Status label with its reason. `detailed` renders the reason under the badge;
 * otherwise it lives in the tooltip.
 */
export function StatusBadge({
  info,
  row,
  detailed = false,
}: {
  info: TokenStatusInfo
  /** When given, the localised reason is filled with the row's real figures. */
  row?: TokenRow
  detailed?: boolean
}) {
  const { t } = useT()
  const duration = useDuration()
  const rules = STATUS_RULES[info.status]
  const reasonKey = `status.${info.status}.reason` as MessageKey

  const vars: Record<string, string | number> = {}
  if (row) {
    vars.pct = formatPct(row.concentration.topClusterPct, 0)
    vars.threshold = formatPct(row.concentration.thresholdPct, 0)
    vars.depth = formatUsdgCompact(row.quoteDepth)
    vars.age = duration(Date.now() - row.lastSampleAt)
  }
  const localised = t(reasonKey, vars)
  // A template left with a hole in it means we lacked the figure; the
  // adapter's own sentence is better than a visible placeholder.
  const reason = /\{\w+\}/.test(localised) ? info.reason : localised

  const badge = (
    <Pill tone={rules.tone} title={reason} className="whitespace-nowrap">
      {t(`status.${info.status}` as MessageKey)}
      {rules.timed && info.recheckAt ? (
        <span className="font-normal opacity-80">
          · <Countdown until={info.recheckAt} />
        </span>
      ) : null}
    </Pill>
  )

  if (!detailed) return badge
  return (
    <div className="flex flex-col gap-1">
      {badge}
      <p className="text-mini leading-relaxed text-ink-3">{reason}</p>
      {rules.timed && info.recheckAt && (
        <p className="text-micro text-ink-4">
          {t('status.recheckIn', { time: '' })}
          <Countdown until={info.recheckAt} className="text-ink-2" />
        </p>
      )}
    </div>
  )
}

/**
 * SPEC §5: two price marks, always. The settlement price is the headline; the
 * spot follows, greyed, and hovering it explains why the two differ — before
 * the user decides the product is broken because DexScreener says otherwise.
 */
export function DualMark({
  settlement,
  spot,
  settlementHintKey = 'positions.settlementHint',
  size = 'sm',
}: {
  settlement: string
  spot: string
  settlementHintKey?: MessageKey
  size?: 'sm' | 'md'
}) {
  const { t } = useT()
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span
        className={cn('num font-semibold text-ink', size === 'md' ? 'text-sm' : 'text-xs')}
        title={t(settlementHintKey)}
      >
        {formatMicroPrice(settlement)}
      </span>
      <span
        className="num inline-flex cursor-help items-center gap-0.5 text-micro text-ink-4"
        title={t('positions.spotHint')}
      >
        {t('positions.spot')} {formatMicroPrice(spot)}
        <Info size={9} />
      </span>
    </span>
  )
}

/** A label/value row with an optional explanation on hover. */
export function KV({
  label,
  hint,
  children,
  highlight,
}: {
  label: ReactNode
  hint?: string
  children: ReactNode
  /** Flash the row when the value just changed on a requote. */
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0 transition-colors duration-700',
        highlight && 'bg-warn/15',
      )}
    >
      <span className={cn('text-mini text-ink-3', hint && 'cursor-help')} title={hint}>
        {label}
      </span>
      <span className="num text-right text-mini text-ink">{children}</span>
    </div>
  )
}

/** Horizontal before/after utilisation bar (§4A). */
export function UtilizationBar({ before, after }: { before: number; after?: number }) {
  const b = Math.min(Math.max(before, 0), 1)
  const a = after === undefined ? b : Math.min(Math.max(after, 0), 1)
  const hot = a > 0.8
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-line">
      <div className="absolute inset-y-0 left-0 bg-ink-3" style={{ width: `${b * 100}%` }} />
      {a > b && (
        <div
          className={cn('absolute inset-y-0', hot ? 'bg-short' : 'bg-accent')}
          style={{ left: `${b * 100}%`, width: `${(a - b) * 100}%` }}
        />
      )}
      {/* The kink: past this point every slice costs several times more. */}
      <div className="absolute inset-y-0 w-px bg-warn" style={{ left: '80%' }} />
    </div>
  )
}
