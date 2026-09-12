'use client'

/**
 * Spot ticket — buy or sell the token itself.
 *
 * Same discipline as the short ticket: it types an amount, asks the adapter
 * for a quote, and shows what comes back. It never prices a fill on its own.
 * A quote carries a minimum received; the fill is refused when the pool moved
 * past the slippage tolerance in between, and the ticket requotes and says so.
 *
 * Buying is denominated in USDG, selling in token units — the two do not
 * convert by retyping, so switching side resets the amount. MAX on the sell
 * side keeps the exact holding rather than a rounded string, or every full
 * exit would leave dust behind.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAdapterQuery, useRuntime } from '@/components/protocol/provider'
import { KV } from '@/components/ui/protocol-ui'
import { notify } from '@/components/shell/notifications'
import { decodeError, REQUOTE_ON } from '@/lib/protocol/adapter'
import {
  formatMicroPrice,
  formatPct,
  formatTokenAmount,
  formatUsdg,
  parseTokenAmount,
  parseUsdg,
  tokenAmountToInput,
} from '@/lib/protocol/fixed'
import type { SwapQuote, SwapSide, TokenRow } from '@/lib/protocol/types'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const SLIPPAGES = [50, 100, 300] as const
const BUY_PRESETS = [50, 100, 250, 1000] as const
const SELL_PRESETS = [0.25, 0.5, 0.75, 1] as const

export function TradeTicket({ token, side }: { token: TokenRow; side: SwapSide }) {
  const { t } = useT()
  const rt = useRuntime()
  const account = useAdapterQuery((a) => a.account(), [])
  const holdings = useAdapterQuery((a) => a.listHoldings(), [])
  const held = holdings.data?.find((h) => h.token === token.address)?.amount ?? 0n
  const balance = account.data?.usdgBalance ?? 0n

  const [input, setInput] = useState(side === 'buy' ? '100' : '')
  const [exact, setExact] = useState<bigint | null>(null)
  const [slippage, setSlippage] = useState<number>(100)
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    setInput(side === 'buy' ? '100' : '')
    setExact(null)
    setQuote(null)
    setSendError(null)
  }, [side, token.address])

  const amount = useMemo(
    () => exact ?? (side === 'buy' ? parseUsdg(input) : parseTokenAmount(input)),
    [exact, input, side],
  )
  const tradable = token.status.status !== 'PAUSED' && token.status.status !== 'UNTRACKED'

  const requote = useCallback(async () => {
    if (!rt || !amount || amount <= 0n || !tradable) {
      setQuote(null)
      setQuoteError(null)
      return
    }
    try {
      const q = await rt.adapter.quoteSwap(token.address, side, amount, slippage)
      setQuote(q)
      setQuoteError(null)
    } catch (e) {
      setQuote(null)
      setQuoteError(t(`errors.${decodeError(e).code}` as MessageKey))
    }
  }, [rt, amount, side, slippage, token.address, tradable, t])

  useEffect(() => {
    const debounce = setTimeout(requote, 250)
    const refresh = setInterval(requote, 8_000)
    return () => {
      clearTimeout(debounce)
      clearInterval(refresh)
    }
  }, [requote])

  const over = amount !== null && (side === 'buy' ? amount > balance : amount > held)
  const blocked = !tradable
    ? t('trade.unavailable')
    : side === 'sell' && held === 0n
      ? t('trade.nothingToSell', { symbol: token.symbol })
      : over
        ? t(side === 'buy' ? 'errors.InsufficientBalance' : 'errors.InsufficientTokenBalance')
        : null

  const submit = async () => {
    if (!rt || !quote) return
    setSending(true)
    setSendError(null)
    try {
      const trade = await rt.adapter.executeSwap(quote)
      notify({
        tone: side === 'buy' ? 'long' : 'info',
        title: t(side === 'buy' ? 'notify.bought' : 'notify.sold', { symbol: token.symbol }),
        body: t('notify.fillBody', {
          amount: formatTokenAmount(trade.tokenAmount),
          symbol: token.symbol,
          price: formatMicroPrice(trade.price),
          total: formatUsdg(trade.usdgAmount),
        }),
        href: '/positions',
      })
      if (side === 'sell') {
        setInput('')
        setExact(null)
      }
    } catch (e) {
      const err = decodeError(e)
      setSendError(t(`errors.${err.code}` as MessageKey))
      if (REQUOTE_ON.includes(err.code)) void requote()
    } finally {
      setSending(false)
    }
  }

  const impactTone = !quote
    ? 'text-ink'
    : quote.priceImpactBps > 500
      ? 'text-short'
      : quote.priceImpactBps > 200
        ? 'text-warn'
        : 'text-ink'
  const dash = <span className="text-ink-4">—</span>

  return (
    <section className="panel flex flex-col gap-3 p-4">
      {/* ── amount ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor={`amount-${side}`} className="text-mini font-medium text-ink-2">
            {t(side === 'buy' ? 'trade.amountBuy' : 'trade.amountSell')}
          </label>
          <span className="num text-micro text-ink-3">
            {side === 'buy'
              ? `${t('ticket.balance')} ${formatUsdg(balance)}`
              : t('trade.holding', { amount: `${formatTokenAmount(held)} ${token.symbol}` })}
          </span>
        </div>
        <div className="field flex h-12 items-center px-4">
          {side === 'buy' && <span className="text-ink-3">$</span>}
          <input
            id={`amount-${side}`}
            inputMode="decimal"
            placeholder="0"
            value={input}
            onChange={(e) => {
              setExact(null)
              setInput(e.target.value.replace(/[^\d.]/g, ''))
            }}
            className="num min-w-0 flex-1 bg-transparent px-2 text-right text-lg font-semibold text-ink outline-hidden placeholder:text-ink-4"
          />
          <span className="text-micro font-semibold text-ink-3">{side === 'buy' ? 'USDG' : token.symbol}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {side === 'buy'
            ? BUY_PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setExact(null)
                    setInput(String(v))
                  }}
                  className="btn-ghost num h-8 text-mini font-semibold"
                >
                  ${v}
                </button>
              ))
            : SELL_PRESETS.map((f) => (
                <button
                  key={f}
                  disabled={held === 0n}
                  onClick={() => {
                    const part = f === 1 ? held : (held * BigInt(Math.round(f * 100))) / 100n
                    setExact(part)
                    setInput(tokenAmountToInput(part))
                  }}
                  className="btn-ghost num h-8 text-mini font-semibold disabled:opacity-40"
                >
                  {f === 1 ? t('trade.max') : `${f * 100}%`}
                </button>
              ))}
        </div>
      </div>

      {/* ── slippage ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-mini text-ink-3">{t('trade.slippage')}</span>
        <div className="seg">
          {SLIPPAGES.map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              aria-pressed={slippage === s}
              className={cn(
                'num px-3 py-1 text-micro font-semibold transition-colors',
                slippage === s ? 'bg-ink text-void' : 'text-ink-3 hover:text-ink',
              )}
            >
              {s / 100}%
            </button>
          ))}
        </div>
      </div>

      {/* ── quote ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col">
        <KV label={t('trade.spot')}>
          {quote ? <span className="num">{formatMicroPrice(quote.spotPrice)}</span> : dash}
        </KV>
        <KV label={t('trade.execution')}>
          {quote ? <span className="num">{formatMicroPrice(quote.executionPrice)}</span> : dash}
        </KV>
        <KV label={t('trade.impact')}>
          {quote ? <span className={cn('num', impactTone)}>{formatPct(quote.priceImpactBps / 10_000, 2)}</span> : dash}
        </KV>
        <KV label={t('trade.fee')}>
          {quote ? <span className="num">{formatUsdg(quote.fee)}</span> : dash}
        </KV>
        <KV label={t('trade.receive')}>
          {quote ? (
            <span className="num font-semibold text-ink">
              {side === 'buy' ? `${formatTokenAmount(quote.amountOut)} ${token.symbol}` : formatUsdg(quote.amountOut)}
            </span>
          ) : (
            dash
          )}
        </KV>
        <KV label={t('trade.minReceived')}>
          {quote ? (
            <span className="num text-ink-2">
              {side === 'buy'
                ? `${formatTokenAmount(quote.minAmountOut)} ${token.symbol}`
                : formatUsdg(quote.minAmountOut)}
            </span>
          ) : (
            dash
          )}
        </KV>
      </div>

      {quote && quote.priceImpactBps > 500 && (
        <p className="rounded-[10px] border border-warn/30 bg-warn/10 p-2.5 text-mini text-warn">{t('trade.impactHigh')}</p>
      )}
      {(sendError ?? quoteError) && (
        <p className="rounded-[10px] border border-short/30 bg-short/10 p-2.5 text-mini text-short">{sendError ?? quoteError}</p>
      )}

      <button
        onClick={submit}
        disabled={!!blocked || !quote || sending}
        className={cn('h-12 w-full text-sm', side === 'buy' ? 'btn-buy' : 'btn-sell')}
      >
        {t(side === 'buy' ? 'trade.submitBuy' : 'trade.submitSell', { symbol: token.symbol })}
        {sending ? '…' : ''}
      </button>
      {blocked && <p className="-mt-1 text-center text-mini text-ink-3">{blocked}</p>}
      {rt?.mode === 'paper' && <p className="text-center text-micro text-ink-4">{t('ticket.paperNote')}</p>}
    </section>
  )
}
