'use client'

/**
 * ⌘K. Symbol search.
 *
 * Keyboard-first because the target user does not reach for a mouse to change
 * chart. Opening it is also how the header search behaves, so there is exactly
 * one search surface in the product.
 *
 * Ranking lives in lib/search.ts. It matters here more than in most products:
 * a hundred of these listings are memecoins whose tickers deliberately collide
 * with the equities they are quoted against.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, Search } from 'lucide-react'
import { ASSETS, isStockPaired } from '@/lib/assets'
import { ageLabel, pct, price, shortAddress, usdAbbr } from '@/lib/format'
import { looksLikeAddress, searchAssets } from '@/lib/search'
import { cn } from '@/lib/utils'
import { Pill } from '@/components/ui/primitives'

interface ChainToken {
  source: 'chain' | 'listed'
  address: string
  symbol: string
  name: string
  supply?: number
}

type ChainLookup =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'found'; token: ChainToken }
  | { state: 'missing' }
  | { state: 'error' }

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('shortcoin:command-palette', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('shortcoin:command-palette', onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const hits = useMemo(() => searchAssets(ASSETS, query, 12), [query])
  const results = useMemo(() => hits.map((h) => h.asset), [hits])

  // A full contract address that matches nothing locally is not a dead end: the
  // chain knows what it is even when our lists do not. Ask it.
  const [chain, setChain] = useState<ChainLookup>({ state: 'idle' })
  const trimmed = query.trim()
  const shouldLookUp = /^0x[0-9a-fA-F]{40}$/.test(trimmed) && hits.length === 0

  useEffect(() => {
    if (!shouldLookUp) {
      setChain({ state: 'idle' })
      return
    }
    let cancelled = false
    setChain({ state: 'loading' })
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/token?address=${trimmed}`)
        if (cancelled) return
        if (!res.ok) {
          setChain({ state: 'missing' })
          return
        }
        setChain({ state: 'found', token: await res.json() })
      } catch {
        if (!cancelled) setChain({ state: 'error' })
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [shouldLookUp, trimmed])

  const commit = (i: number) => {
    const asset = results[i]
    if (!asset) return
    router.push(`/t/${asset.symbol}`)
    setOpen(false)
  }

  const openChainToken = () => {
    if (chain.state !== 'found') return
    router.push(
      chain.token.source === 'listed' ? `/t/${chain.token.symbol}` : `/t/${chain.token.address}`,
    )
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-2xl shadow-black/60"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Search size={15} className="text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(c + 1, results.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                if (chain.state === 'found') openChainToken()
                else commit(cursor)
              }
            }}
            placeholder="Search a ticker, coin, company or contract address…"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
          />
          <kbd className="num rounded-[3px] border border-line px-1.5 py-0.5 text-micro text-ink-4">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {/* ── on-chain lookup ─────────────────────────────────────────── */}
          {chain.state === 'loading' && (
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <span className="pulse-dot size-1.5 shrink-0 rounded-full bg-accent" />
              <span className="text-xs text-ink-3">Reading Robinhood Chain…</span>
            </div>
          )}

          {chain.state === 'found' && (
            <button
              onClick={openChainToken}
              className="flex w-full items-center gap-3 bg-raised px-3.5 py-2.5 text-left"
            >
              <span
                className="num grid size-6 shrink-0 place-items-center rounded-[4px] text-micro font-bold text-void"
                style={{ background: `hsl(${(chain.token.symbol.charCodeAt(0) * 37) % 360} 62% 58%)` }}
              >
                {chain.token.symbol.slice(0, 2)}
              </span>
              <span className="flex w-[128px] shrink-0 items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-ink">
                  {chain.token.symbol}
                </span>
                <Pill tone={chain.token.source === 'listed' ? 'neutral' : 'long'}>
                  {chain.token.source === 'listed' ? 'LISTED' : 'ON-CHAIN'}
                </Pill>
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-xs text-ink-3">{chain.token.name}</span>
                <span className="num truncate text-micro text-info">
                  {shortAddress(chain.token.address, 10, 8)}
                </span>
              </span>
              <CornerDownLeft size={12} className="shrink-0 text-ink-4" />
            </button>
          )}

          {chain.state === 'missing' && (
            <div className="px-3.5 py-8 text-center">
              <p className="text-xs text-ink-3">Nothing at that address.</p>
              <p className="mt-1 text-mini text-ink-4">
                Robinhood Chain has no contract there, or it is not an ERC-20.
              </p>
            </div>
          )}

          {chain.state === 'error' && (
            <div className="px-3.5 py-8 text-center">
              <p className="text-xs text-ink-3">Could not reach the chain.</p>
              <p className="mt-1 text-mini text-ink-4">The public RPC did not answer. Try again.</p>
            </div>
          )}

          {results.length === 0 && chain.state === 'idle' && (
            <div className="px-3.5 py-8 text-center">
              <p className="text-xs text-ink-3">Nothing matches “{query}”.</p>
              <p className="mt-1 text-mini text-ink-4">
                {looksLikeAddress(query)
                  ? 'Paste the full 42-character address and it will be read straight off the chain.'
                  : 'Try a ticker, a company name, or paste a contract address.'}
              </p>
            </div>
          )}

          {hits.map((hit, i) => {
            const asset = hit.asset
            const isCoin = asset.assetClass === 'coin'
            return (
              <button
                key={asset.symbol}
                onMouseEnter={() => setCursor(i)}
                onClick={() => commit(i)}
                className={cn(
                  'flex w-full items-center gap-3 px-3.5 py-2 text-left',
                  i === cursor ? 'bg-raised' : 'hover:bg-raised/50',
                )}
              >
                <span
                  className="num grid size-6 shrink-0 place-items-center rounded-[4px] text-micro font-bold text-void"
                  style={{ background: `hsl(${asset.logoHue} 62% 58%)` }}
                >
                  {asset.symbol.slice(0, 2)}
                </span>

                <span className="flex w-[128px] shrink-0 items-center gap-1.5">
                  <span className="truncate text-xs font-semibold text-ink">{asset.symbol}</span>
                  <Pill tone={isCoin ? 'accent' : 'neutral'}>{isCoin ? 'COIN' : 'STOCK'}</Pill>
                </span>

                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-xs text-ink-3">{asset.name}</span>
                  <span className="flex items-center gap-1.5 text-micro text-ink-4">
                    {/* When the match came off the address, show the address —
                        otherwise the row gives no clue why it is in the list. */}
                    {hit.reason === 'address' ? (
                      <span className="num text-info">{shortAddress(asset.address, 8, 6)}</span>
                    ) : (
                      <>
                        <span>{usdAbbr(asset.liquidity)} liq</span>
                        {asset.ageHours !== undefined && <span>· {ageLabel(asset.ageHours)}</span>}
                        {isStockPaired(asset) && (
                          <span className="num text-info">· /{asset.quote}</span>
                        )}
                      </>
                    )}
                  </span>
                </span>

                <span className="num text-xs text-ink-2">{price(asset.price)}</span>
                <span
                  className={cn(
                    'num w-[62px] text-right text-xs',
                    asset.change24h >= 0 ? 'text-long' : 'text-short',
                  )}
                >
                  {pct(asset.change24h, 1)}
                </span>
                {i === cursor && <CornerDownLeft size={12} className="shrink-0 text-ink-4" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
