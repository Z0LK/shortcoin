'use client'

/**
 * HLP — SPEC §4D.
 *
 * Deposit, withdraw, NAV, share price, utilisation, realised yield — and two
 * things that must be impossible to miss:
 *   - reserved capital cannot be withdrawn; only the unreserved part can
 *   - the lockup, with its countdown
 *
 * A depositor also sees the theoretical maximum drawdown, not just past yield:
 * past yield says nothing about the day every backed position hits its cap.
 */

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { useAdapterQuery, useRuntime } from '@/components/protocol/provider'
import { AddressChip, Countdown } from '@/components/ui/protocol-ui'
import { decodeError } from '@/lib/protocol/adapter'
import {
  formatMicroPrice,
  formatPct,
  formatUsdg,
  formatUsdgCompact,
  parseUsdg,
} from '@/lib/protocol/fixed'
import { resolveAsset } from '@/lib/universe'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="glass glass-hover flex flex-col gap-2 p-4" title={hint}>
      <span className="mono text-[9.5px] font-medium text-ink-3">{label}</span>
      <span className={cn('num text-[19px] text-acid', tone)}>{value}</span>
    </div>
  )
}

export function HlpScreen() {
  const { t } = useT()
  const rt = useRuntime()
  const data = useAdapterQuery((a) => a.hlp(), [], { everyMs: 3000 })
  const account = useAdapterQuery((a) => a.account(), [])
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pool = data.data?.pool
  const me = data.data?.account
  if (!pool || !me) {
    return <div className="grid h-full place-items-center mono text-[10px] text-ink-3">{t('common.loading')}</div>
  }

  const amount = parseUsdg(input)
  const locked = me.lockedUntil !== null && Date.now() < me.lockedUntil
  const reservedShare = pool.utilization
  const max = mode === 'deposit' ? (account.data?.usdgBalance ?? 0n) : me.withdrawable

  const submit = async () => {
    if (!rt || !amount) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'deposit') await rt.adapter.hlpDeposit(amount)
      else await rt.adapter.hlpWithdraw(amount)
      setInput('')
      data.refresh()
      account.refresh()
    } catch (e) {
      setError(t(`errors.${decodeError(e).code}` as MessageKey))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-3 p-3 sm:gap-4 sm:p-6">
        <header className="rise-in">
          <p className="mono flex items-center gap-2 text-[10px] text-ink-3">
            <span className="size-1.5 rounded-full bg-acid" /> 03 — {t('nav.hlp')}
          </p>
          <h1 className="display mt-2 text-[clamp(2rem,5vw,3.2rem)] text-glow">{t('hlp.title')}</h1>
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-ink-2">{t('hlp.subtitle')}</p>
        </header>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label={t('hlp.nav')} value={formatUsdgCompact(pool.nav)} />
          <Stat label={t('hlp.sharePrice')} value={formatMicroPrice(pool.sharePrice)} />
          <Stat
            label={t('hlp.utilization')}
            value={`${formatPct(pool.utilization, 1)} / ${formatPct(pool.utilizationCap, 0)}`}
            tone={pool.utilization > pool.utilizationCap * 0.9 ? 'text-warn' : undefined}
          />
          <Stat label={t('hlp.apr')} value={formatPct(me.realizedApr, 1)} tone="text-long" />
        </div>

        {/* Reserved vs unreserved: the split that decides what can leave. */}
        <section className="glass p-4">
          <div className="mb-1.5 flex justify-between text-mini">
            <span className="flex items-center gap-1 font-semibold text-ink" title={t('hlp.reservedHint')}>
              <Lock size={11} className="text-warn" /> {t('hlp.reserved')} {formatUsdgCompact(pool.reserved)}
            </span>
            <span className="text-ink-3">
              {t('hlp.unreserved')} {formatUsdgCompact(pool.nav - pool.reserved)}
            </span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-long/25">
            <div
              className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(45deg,var(--warn)_0_4px,color-mix(in_oklab,var(--warn)_60%,transparent)_4px_8px)]"
              style={{ width: `${reservedShare * 100}%` }}
            />
            <div className="absolute inset-y-0 w-px bg-short" style={{ left: `${pool.utilizationCap * 100}%` }} title={t('hlp.utilizationCap')} />
          </div>
          <p className="mt-1.5 text-micro text-ink-3">{t('hlp.reservedHint')}</p>
        </section>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ── your position ────────────────────────────────────────────── */}
          <section className="glass flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold tracking-[-0.01em]">{t('hlp.yours')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-micro text-ink-4">{t('hlp.value')}</p>
                <p className="num text-base font-semibold">{formatUsdg(me.value)}</p>
              </div>
              <div>
                <p className="text-micro text-ink-4">{t('hlp.withdrawable')}</p>
                <p className="num text-base font-semibold text-long">{formatUsdg(me.withdrawable)}</p>
              </div>
            </div>

            <div
              className={cn(
                'flex items-center gap-2 rounded-xl border p-2.5',
                locked ? 'border-warn/40 bg-warn/10' : 'border-line bg-sunken',
              )}
            >
              <Lock size={14} className={locked ? 'text-warn' : 'text-ink-4'} />
              <div className="text-mini">
                {locked && me.lockedUntil ? (
                  <span className="text-warn">
                    {t('hlp.lockupEnds')} <Countdown until={me.lockedUntil} className="font-semibold" />
                  </span>
                ) : (
                  <span className="text-ink-3">{t('hlp.lockupNone')}</span>
                )}
                <p className="text-micro text-ink-4">{t('hlp.lockupReset', { days: Math.round(pool.lockupSeconds / 86400) })}</p>
              </div>
            </div>

            <div className="rounded-xl border border-short/30 bg-short/5 p-2.5" title={t('hlp.drawdownHint')}>
              <p className="text-micro text-ink-4">{t('hlp.drawdown')}</p>
              <p className="num text-base font-semibold text-short">{formatUsdg(-me.maxDrawdown)}</p>
              <p className="mt-1 text-micro leading-relaxed text-ink-3">{t('hlp.drawdownHint')}</p>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="seg">
                {(['deposit', 'withdraw'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={cn('flex-1 rounded-md py-1 text-mini font-semibold', mode === m ? 'bg-acid text-accent-ink' : 'text-ink-3 hover:text-ink')}
                  >
                    {t(`hlp.${m}` as MessageKey)}
                  </button>
                ))}
              </div>
              <div className="flex h-10 items-center rounded-xl border border-line bg-sunken px-3">
                <input
                  inputMode="decimal"
                  value={input}
                  onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder={t('hlp.amount')}
                  className="num min-w-0 flex-1 bg-transparent text-right text-sm text-ink outline-hidden placeholder:text-ink-4"
                />
                <button
                  onClick={() => setInput(formatUsdg(max).replace(/[$,]/g, ''))}
                  className="ml-2 text-micro font-semibold text-info"
                >
                  MAX
                </button>
              </div>
              {mode === 'withdraw' && locked && <p className="text-micro text-warn">{t('errors.LockupActive')}</p>}
              {error && <p className="text-micro text-short">{error}</p>}
              <button
                onClick={submit}
                disabled={busy || !amount || amount <= 0n || amount > max || (mode === 'withdraw' && locked)}
                className="h-10 rounded-xl bg-accent text-xs font-semibold text-accent-ink hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {busy ? t(mode === 'deposit' ? 'hlp.depositing' : 'hlp.withdrawing') : t(`hlp.${mode}` as MessageKey)}
              </button>
            </div>
          </section>

          {/* ── exposure ─────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-2 glass p-3">
            <h2 className="text-sm font-semibold tracking-[-0.01em]">{t('hlp.exposure')}</h2>
            <div className="flex flex-col">
              {pool.perTokenExposure.map((e) => {
                const share = Number((e.reserved * 10_000n) / pool.nav) / 10_000
                const cap = e.capBps / 10_000
                const sym = resolveAsset(e.token)?.symbol ?? rt?.paper?.symbolOf(e.token) ?? ''
                return (
                  <div key={e.token} className="flex flex-col gap-1 border-b border-line/60 py-1.5 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{sym}</span>
                        <AddressChip address={e.token} head={6} tail={4} />
                      </span>
                      <span className="num text-mini text-ink-2">
                        {formatUsdgCompact(e.reserved)} · {formatPct(share, 2)}
                      </span>
                    </div>
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className={cn('h-full', share > cap * 0.85 ? 'bg-warn' : 'bg-info')}
                        style={{ width: `${Math.min(share / cap, 1) * 100}%` }}
                      />
                    </div>
                    <span className="text-micro text-ink-4">{t('hlp.exposureCap', { pct: formatPct(cap, 1) })}</span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
