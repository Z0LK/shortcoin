'use client'

/**
 * The opening ticket — SPEC §4A, right-hand column.
 *
 * The ticket never computes the entry price, the premium or the capacity. It
 * types an amount, asks the quoter, and shows what comes back. The formulas in
 * lib/protocol/payoff.ts draw the graph and cross-check the quote in dev; they
 * do not decide anything.
 *
 * The flow is the one the contracts will need (§7.5): quote → approve USDG if
 * the allowance is short → simulate → send. A quote lives for seconds; when it
 * expires the ticket requotes on its own and highlights whatever moved. When a
 * send fails because someone took the capacity in between, the ticket requotes
 * and says so in a sentence, never with a raw revert.
 *
 * The button says what happens — "Ouvrir la position" — and keeps saying it
 * until the confirmation toast.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { HelpCircle } from 'lucide-react'
import { useAdapterQuery, useNow, useRuntime } from '@/components/protocol/provider'
import { Countdown, KV, UtilizationBar, useStatusReason } from '@/components/ui/protocol-ui'
import { PayoffChart } from '@/components/ticket/payoff-chart'
import { notify } from '@/components/shell/notifications'
import { decodeError, REQUOTE_ON, type ProtocolError } from '@/lib/protocol/adapter'
import {
  USDG_UNIT,
  fixedToNumber,
  formatBps,
  formatMicroPrice,
  formatPct,
  formatUsdg,
  parseUsdg,
  usdgToNumber,
} from '@/lib/protocol/fixed'
import { crossCheckQuote, positionValue } from '@/lib/protocol/payoff'
import { accessPolicy } from '@/lib/protocol/runtime'
import type { OpenQuote, TokenRow } from '@/lib/protocol/types'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const PRESETS = [0.25, 0.5, 0.75, 1] as const
const CHANGE_FIELDS: (keyof OpenQuote)[] = [
  'entryPrice',
  'notional',
  'dailyRateBps',
  'marginalRateBps',
  'utilizationAfter',
  'backing',
]

type Phase = 'idle' | 'approving' | 'opening'

function errorText(t: (k: MessageKey, v?: Record<string, string | number>) => string, err: ProtocolError) {
  if (err.code === 'CapacityExceeded' && err.detail?.maxCollateral) {
    return t('errors.CapacityExceeded.max', { max: formatUsdg(BigInt(err.detail.maxCollateral)) })
  }
  if (err.code === 'CollateralTooSmall' && err.detail?.min) {
    return t('errors.CollateralTooSmall', { min: formatUsdg(BigInt(err.detail.min)) })
  }
  return t(`errors.${err.code}` as MessageKey)
}

/** Premium projection at the quoted rate. Display only — see the comment in PayoffChart. */
function dailyPremium(q: OpenQuote): number {
  return usdgToNumber(q.collateral) * (q.dailyRateBps / 10_000)
}

export function OpenTicket({ token }: { token: TokenRow }) {
  const { t } = useT()
  const rt = useRuntime()
  const now = useNow()
  const account = useAdapterQuery((a) => a.account(), [])

  const [input, setInput] = useState('250')
  const [quote, setQuote] = useState<OpenQuote | null>(null)
  const [quoteError, setQuoteError] = useState<ProtocolError | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [sendError, setSendError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const collateral = useMemo(() => parseUsdg(input), [input])
  const balance = account.data?.usdgBalance ?? 0n
  const allowance = account.data?.usdgAllowance ?? 0n
  const access = accessPolicy(rt?.mode ?? 'paper', null)

  const prevQuote = useRef<OpenQuote | null>(null)

  const requestQuote = useCallback(
    /**
     * `reason` is shown with the new quote. `onlyIfChanged` suppresses it when
     * the automatic refresh produced identical numbers — a notice every twenty
     * seconds saying nothing moved would train people to ignore the one that
     * matters.
     */
    async (reason?: string, onlyIfChanged = false) => {
      if (!rt || !collateral || collateral <= 0n || !token.status.canOpen) {
        setQuote(null)
        return
      }
      setQuoting(true)
      try {
        const q = await rt.adapter.quoteOpen(token.address, collateral)
        // Highlight what moved since the last quote, so a requote is visible
        // rather than silently swapping numbers under the cursor.
        const prev = prevQuote.current
        if (prev && prev.collateral === q.collateral) {
          const diff = new Set(
            CHANGE_FIELDS.filter((f) => JSON.stringify(prev[f], (_, v) => (typeof v === 'bigint' ? v.toString() : v)) !==
              JSON.stringify(q[f], (_, v) => (typeof v === 'bigint' ? v.toString() : v))).map(String),
          )
          setChanged(diff)
          if (diff.size) setTimeout(() => setChanged(new Set()), 2600)
        } else {
          setChanged(new Set())
        }
        const moved = !!prev && prev.collateral === q.collateral &&
          CHANGE_FIELDS.some((f) => JSON.stringify(prev[f], (_, v) => (typeof v === 'bigint' ? v.toString() : v)) !==
            JSON.stringify(q[f], (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
        prevQuote.current = q
        setQuote(q)
        setQuoteError(null)
        if (reason && (!onlyIfChanged || moved)) setNotice(reason)

        crossCheckQuote(token.symbol, {
          collateral: usdgToNumber(q.collateral),
          notional: usdgToNumber(q.notional),
          entry: fixedToNumber(q.entryPrice),
          cap: fixedToNumber(q.capPrice),
          barrier: fixedToNumber(q.barrierPrice),
          capPct: q.capPct,
          barrierPct: q.barrierPct,
          maxPayout: usdgToNumber(q.maxPayout),
        })
      } catch (e) {
        setQuote(null)
        setQuoteError(decodeError(e))
      } finally {
        setQuoting(false)
      }
    },
    [rt, collateral, token.address, token.status.canOpen, token.symbol],
  )

  // Quote when the amount settles.
  useEffect(() => {
    setNotice(null)
    const id = setTimeout(() => void requestQuote(), 250)
    return () => clearTimeout(id)
  }, [requestQuote])

  // Requote on expiry, automatically.
  useEffect(() => {
    if (!quote || phase !== 'idle') return
    const ms = quote.expiresAt - Date.now()
    const id = setTimeout(() => void requestQuote(t('ticket.quoteRefreshed'), true), Math.max(ms, 0))
    return () => clearTimeout(id)
  }, [quote, phase, requestQuote, t])

  const setFraction = (f: number) => {
    const amount = (balance * BigInt(Math.round(f * 100))) / 100n
    const whole = amount / USDG_UNIT
    const cents = (amount % USDG_UNIT) / 10_000n
    setInput(`${whole}.${cents.toString().padStart(2, '0')}`)
  }

  const needsApproval = !!quote && allowance < quote.collateral

  const statusReason = useStatusReason(token)
  const blocked: string | null = !token.status.canOpen
    ? statusReason
    : !access.allowed
      ? t('ticket.disabled.restricted')
      : !collateral || collateral <= 0n
        ? t('ticket.disabled.empty')
        : collateral > balance
          ? t('ticket.disabled.balance')
          : quoteError
            ? errorText(t, quoteError)
            : null

  const approve = async () => {
    if (!rt || !quote) return
    setPhase('approving')
    setSendError(null)
    try {
      await rt.adapter.approveUsdg(quote.collateral)
      account.refresh()
    } catch (e) {
      setSendError(errorText(t, decodeError(e)))
    } finally {
      setPhase('idle')
    }
  }

  const open = async () => {
    if (!rt || !quote) return
    setPhase('opening')
    setSendError(null)
    setNotice(null)
    try {
      const sim = await rt.adapter.simulateOpen(quote)
      if (sim) throw sim
      await rt.adapter.openPosition(quote)
      notify({
        tone: 'long',
        title: t('ticket.opened'),
        body: `${token.symbol} · ${formatUsdg(quote.collateral)}`,
        href: '/positions',
      })
      account.refresh()
      prevQuote.current = null
      void requestQuote()
    } catch (e) {
      const err = decodeError(e)
      if (REQUOTE_ON.includes(err.code)) {
        await requestQuote(err.code === 'CapacityExceeded' ? t('ticket.capacityRace') : t('ticket.quoteExpired'))
      } else {
        setSendError(errorText(t, err))
      }
    } finally {
      setPhase('idle')
    }
  }

  const q = quote
  const daily = q ? dailyPremium(q) : 0

  // The entry is min(spot, TWAP) but the payout marks on max(TWAP24, TWAP72).
  // In a falling market the TWAPs trail above spot, so a position can open
  // marked below its own collateral. Say so before the button, not after.
  const settlementMarkNow =
    BigInt(token.twap24h) > BigInt(token.twap72h) ? token.twap24h : token.twap72h
  const startingMark = q
    ? positionValue(
        {
          collateral: usdgToNumber(q.collateral),
          notional: usdgToNumber(q.notional),
          entry: fixedToNumber(q.entryPrice),
          cap: fixedToNumber(q.capPrice),
          barrier: fixedToNumber(q.barrierPrice),
        },
        fixedToNumber(settlementMarkNow),
      ) /
        usdgToNumber(q.collateral) -
      1
    : null

  return (
    <section className="flex flex-col gap-3 border border-line bg-surface p-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('ticket.title')}</h2>
        <button
          onClick={() => setShowHelp((v) => !v)}
          aria-expanded={showHelp}
          className="flex items-center gap-1 text-mini text-ink-3 hover:text-ink"
        >
          <HelpCircle size={13} /> {t('ticket.help.title')}
        </button>
      </header>

      {showHelp && (
        <ul className="flex flex-col gap-1.5 rounded-[5px] border border-line bg-sunken p-2.5">
          {(['ticket.help.1', 'ticket.help.2', 'ticket.help.3'] as const).map((k) => (
            <li key={k} className="flex gap-2 text-mini leading-relaxed text-ink-2">
              <span className="text-short">•</span>
              {t(k)}
            </li>
          ))}
        </ul>
      )}

      {/* ── collateral ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="collateral" className="text-mini font-semibold text-ink-2">
            {t('ticket.collateral')}
          </label>
          <span className="num text-micro text-ink-4">
            {t('ticket.balance')} {formatUsdg(balance)}
          </span>
        </div>
        <div className="flex h-11 items-center rounded-[5px] border border-line bg-sunken px-3 focus-within:border-line-strong">
          <span className="text-ink-4">$</span>
          <input
            id="collateral"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ''))}
            className="num min-w-0 flex-1 bg-transparent px-2 text-right text-lg font-semibold text-ink outline-hidden"
          />
          <span className="text-micro font-semibold text-ink-4">USDG</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {PRESETS.map((f) => (
            <button
              key={f}
              onClick={() => setFraction(f)}
              className="h-8 rounded-[4px] border border-line bg-raised text-mini font-semibold text-ink-2 hover:text-ink"
            >
              {f === 1 ? t('ticket.max') : `${f * 100}%`}
            </button>
          ))}
        </div>
      </div>

      {/* ── payoff ─────────────────────────────────────────────────────── */}
      {q && (
        <PayoffChart
          params={{
            collateral: usdgToNumber(q.collateral),
            notional: usdgToNumber(q.notional),
            entry: fixedToNumber(q.entryPrice),
            cap: fixedToNumber(q.capPrice),
            barrier: fixedToNumber(q.barrierPrice),
          }}
          capPct={q.capPct}
          barrierPct={q.barrierPct}
          dailyPremium={daily}
        />
      )}

      {/* ── the quote ──────────────────────────────────────────────────── */}
      {q ? (
        <div className="flex flex-col">
          <KV label={t('ticket.notional')} hint={t('ticket.notionalHint')} highlight={changed.has('notional')}>
            {formatUsdg(q.notional)}
          </KV>
          <KV label={t('ticket.entry')} hint={t('ticket.entrySourceHint')} highlight={changed.has('entryPrice')}>
            {formatMicroPrice(q.entryPrice)}{' '}
            <span className="text-ink-4">({t(`ticket.entrySource.${q.entryPriceSource}` as MessageKey)})</span>
          </KV>
          <KV label={`${t('ticket.cap')} (${formatPct(q.capPct - 1, 0, true)})`}>{formatMicroPrice(q.capPrice)}</KV>
          <KV label={`${t('ticket.barrier')} (${formatPct(q.barrierPct - 1, 0, true)})`}>
            <span className="text-short">{formatMicroPrice(q.barrierPrice)}</span>
          </KV>
          <KV label={t('ticket.maxPayout')}>
            <span className="text-long">{formatUsdg(q.maxPayout, { signed: true })}</span>
          </KV>
          <KV label={t('ticket.maxLoss')}>
            <span className="text-short">{formatUsdg(-q.collateral)}</span>
          </KV>
        </div>
      ) : (
        <p className="rounded-[5px] border border-line bg-sunken p-2.5 text-mini text-ink-3">
          {quoting ? t('ticket.requoting') : blocked ?? t('ticket.requoting')}
        </p>
      )}

      {/* ── rates and cost ─────────────────────────────────────────────── */}
      {q && (
        <div className="flex flex-col gap-2 rounded-[5px] border border-line bg-sunken p-2.5">
          <div className="grid grid-cols-2 gap-2" title={t('ticket.rateHint')}>
            <div className={cn('rounded-[4px] p-1 transition-colors duration-700', changed.has('dailyRateBps') && 'bg-warn/15')}>
              <p className="text-micro text-ink-4">{t('ticket.rate')}</p>
              <p className="num text-sm font-semibold text-ink">{formatBps(q.dailyRateBps)}</p>
            </div>
            <div className={cn('rounded-[4px] p-1 transition-colors duration-700', changed.has('marginalRateBps') && 'bg-warn/15')}>
              <p className="text-micro text-ink-4">{t('ticket.marginal')}</p>
              <p className={cn('num text-sm font-semibold', q.marginalRateBps > q.dailyRateBps * 1.5 ? 'text-warn' : 'text-ink')}>
                {formatBps(q.marginalRateBps)}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-1 text-micro text-ink-4">{t('ticket.cost')}</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              {([1, 7, 30] as const).map((d) => (
                <div key={d} className="rounded-[4px] border border-line bg-surface py-1">
                  <p className="text-micro text-ink-4">{t(`ticket.cost.${d}d` as MessageKey)}</p>
                  <p className="num text-mini font-semibold text-ink">
                    {formatUsdg(BigInt(Math.round(daily * d * Number(USDG_UNIT))))}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className={cn('rounded-[4px] transition-colors duration-700', changed.has('utilizationAfter') && 'bg-warn/15')}>
            <div className="mb-1 flex justify-between text-micro text-ink-4">
              <span>{t('ticket.utilization')}</span>
              <span className="num">
                {t('ticket.utilization.before')} {formatPct(q.utilizationBefore, 0)} → {t('ticket.utilization.after')}{' '}
                <span className="text-ink-2">{formatPct(q.utilizationAfter, 0)}</span>
              </span>
            </div>
            <UtilizationBar before={q.utilizationBefore} after={q.utilizationAfter} />
          </div>

          <div className={cn('rounded-[4px] transition-colors duration-700', changed.has('backing') && 'bg-warn/15')} title={t('ticket.backingHint')}>
            <p className="mb-1 text-micro text-ink-4">{t('ticket.backing')}</p>
            <div className="flex h-2 w-full overflow-hidden rounded-full">
              <div className="bg-info" style={{ width: `${q.backing.treasuryBps / 100}%` }} />
              <div className="bg-ink-3" style={{ width: `${q.backing.hlpBps / 100}%` }} />
            </div>
            <div className="num mt-1 flex justify-between text-micro">
              <span className="text-info">
                {t('ticket.backing.treasury')} {formatPct(q.backing.treasuryBps / 10_000, 0)}
              </span>
              <span className="text-ink-3">
                {t('ticket.backing.hlp')} {formatPct(q.backing.hlpBps / 10_000, 0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── clocks ─────────────────────────────────────────────────────── */}
      {q && (
        <div className="grid grid-cols-2 gap-2 text-micro">
          <div className="rounded-[4px] border border-line p-1.5" title={t('ticket.payoutEligibleHint')}>
            <p className="text-ink-4">{t('ticket.payoutEligible')}</p>
            <Countdown until={q.payoutEligibleAt} className="text-mini text-ink-2" />
          </div>
          <div className="rounded-[4px] border border-line p-1.5">
            <p className="text-ink-4">{t('ticket.quoteExpires')}</p>
            <Countdown until={q.expiresAt} className={cn('text-mini', q.expiresAt - now < 5000 ? 'text-warn' : 'text-ink-2')} />
          </div>
        </div>
      )}

      {q && startingMark !== null && startingMark < -0.01 && (
        <p className="rounded-[4px] border border-warn/30 bg-warn/10 p-2 text-mini leading-relaxed text-warn">
          {t('ticket.startsBelow', {
            pct: formatPct(startingMark, 0),
            twap: formatMicroPrice(settlementMarkNow),
          })}
        </p>
      )}

      {notice && <p className="rounded-[4px] border border-warn/30 bg-warn/10 p-2 text-mini text-warn">{notice}</p>}
      {sendError && <p className="rounded-[4px] border border-short/30 bg-short/10 p-2 text-mini text-short">{sendError}</p>}

      {/* ── action ─────────────────────────────────────────────────────── */}
      {needsApproval && !blocked ? (
        <button
          onClick={approve}
          disabled={phase !== 'idle'}
          className="h-11 w-full rounded-[5px] border border-short/50 bg-short/10 text-sm font-semibold text-short transition-colors hover:bg-short/20 disabled:opacity-50"
        >
          {phase === 'approving' ? t('ticket.approving') : t('ticket.approve', { amount: formatUsdg(q!.collateral).replace('$', '') })}
        </button>
      ) : null}

      <button
        onClick={open}
        disabled={!!blocked || !q || needsApproval || phase !== 'idle' || quoting}
        className="h-12 w-full rounded-[5px] bg-short text-sm font-bold text-[#1a0509] transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {phase === 'opening' ? t('ticket.opening') : t('ticket.open')}
      </button>
      {blocked && <p className="-mt-1 text-center text-mini text-ink-3">{blocked}</p>}

      {rt?.mode === 'paper' && <p className="text-center text-micro text-ink-4">{t('ticket.paperNote')}</p>}
      <Link href="/how-it-works" className="text-center text-micro text-info hover:underline">
        {t('nav.howItWorks')}
      </Link>
    </section>
  )
}
