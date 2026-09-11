'use client'

/**
 * ⌘K — search.
 *
 * SPEC §3: a search always resolves to a state, never to nothing.
 *   valid address, indexed   → the token, with its status and reason
 *   valid address, unknown   → "this token has no tracked pool" + request listing
 *   malformed address        → a format error, which is not the same as missing
 *   a name                   → several results, each with its truncated address
 *                              visible and a badge on homonyms
 *
 * The name never identifies a token on its own — impersonation is the norm on
 * a launchpad — so the address is on every line and copyable from the list.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CornerDownLeft, Search, Send } from 'lucide-react'
import { useRuntime } from '@/components/protocol/provider'
import { AddressChip, StatusBadge } from '@/components/ui/protocol-ui'
import { Pill } from '@/components/ui/primitives'
import { formatBps } from '@/lib/protocol/fixed'
import type { SearchResult } from '@/lib/protocol/types'
import { resolveAsset } from '@/lib/universe'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function CommandPalette() {
  const { t } = useT()
  const router = useRouter()
  const rt = useRuntime()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [requested, setRequested] = useState<string | null>(null)
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
    if (!open) return
    setQuery('')
    setResults([])
    setCursor(0)
    setRequested(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  // Debounced: a pasted address triggers one lookup, not forty-two.
  useEffect(() => {
    if (!rt || !open) return
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const id = setTimeout(async () => {
      const r = await rt.adapter.search(q).catch(() => [])
      if (cancelled) return
      setResults(r)
      setCursor(0)
      setLoading(false)
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [query, rt, open])

  const go = (r: SearchResult | undefined) => {
    if (!r) return
    if (r.kind === 'token') router.push(`/t/${r.token.symbol}`)
    else if (r.kind === 'untracked') router.push(`/t/${r.address}`)
    else return
    setOpen(false)
  }

  const request = async (address: `0x${string}`) => {
    await rt?.adapter.requestListing(address)
    setRequested(address)
  }

  if (!open) return null

  const tokens = results.filter((r): r is Extract<SearchResult, { kind: 'token' }> => r.kind === 'token')
  const untracked = results.find((r): r is Extract<SearchResult, { kind: 'untracked' }> => r.kind === 'untracked')
  const invalid = results.find((r) => r.kind === 'invalid-address')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 px-2 pt-[8vh] backdrop-blur-[3px] sm:pt-[12vh]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="glass w-full max-w-[620px] overflow-hidden bg-[#0c0e1a] shadow-[0_30px_80px_rgba(0,0,0,0.65)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Search size={15} className="text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(c + 1, Math.max(tokens.length - 1, 0)))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                go(tokens[cursor] ?? untracked)
              }
            }}
            placeholder={t('search.placeholder')}
            spellCheck={false}
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-hidden placeholder:text-ink-4"
          />
          <kbd className="num rounded-md border border-line px-1.5 py-0.5 text-micro text-ink-4">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1.5">
          {loading && <p className="px-3.5 py-3 text-xs text-ink-3">{t('search.loading')}</p>}

          {!loading && invalid && (
            <div className="flex gap-3 px-3.5 py-4">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
              <div>
                <p className="text-xs font-semibold text-warn">{t('search.invalid.title')}</p>
                <p className="mt-1 text-mini text-ink-3">{t('search.invalid.body')}</p>
              </div>
            </div>
          )}

          {!loading && untracked && (
            <div className="px-3.5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Pill tone="neutral">{t('status.UNTRACKED')}</Pill>
                    {untracked.symbol && (
                      <span className="truncate text-xs font-semibold text-ink">
                        {untracked.symbol}
                        {untracked.name && <span className="font-normal text-ink-3"> · {untracked.name}</span>}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-ink">{t('search.untracked.title')}</p>
                  <p className="mt-1 text-mini text-ink-3">{t('search.untracked.body')}</p>
                  <div className="mt-2">
                    <AddressChip address={untracked.address} head={10} tail={8} />
                  </div>
                  {untracked.symbol && <p className="mt-1 text-micro text-ink-4">{t('search.onChain')}</p>}
                </div>
                <button
                  onClick={() => request(untracked.address)}
                  disabled={requested === untracked.address}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line-strong px-2.5 py-1.5 text-mini font-semibold text-ink transition-colors hover:bg-raised disabled:cursor-default disabled:border-long/40 disabled:text-long"
                >
                  <Send size={11} />
                  {requested === untracked.address ? t('search.untracked.requested') : t('search.untracked.request')}
                </button>
              </div>
            </div>
          )}

          {!loading &&
            tokens.map((r, i) => {
              const asset = resolveAsset(r.token.symbol)
              return (
                <div
                  key={r.token.address}
                  role="button"
                  tabIndex={-1}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 px-3.5 py-2 text-left',
                    i === cursor ? 'bg-sig/[0.09] text-ink' : 'hover:bg-white/[0.04]',
                  )}
                >
                  <span
                    className="num grid size-7 shrink-0 place-items-center rounded-lg text-micro font-bold text-void"
                    style={{ background: `hsl(${asset?.logoHue ?? 200} 62% 58%)` }}
                  >
                    {r.token.symbol.slice(0, 2)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-ink">{r.token.symbol}</span>
                      <span className="truncate text-mini text-ink-3">{r.token.name}</span>
                      {r.homonym && (
                        <Pill tone="warn" title={t('search.homonymHint')} className="shrink-0">
                          {t('search.homonym')}
                        </Pill>
                      )}
                    </span>
                    <AddressChip address={r.token.address} head={8} tail={6} />
                  </span>
                  <span className="hidden flex-col items-end gap-1 sm:flex">
                    <StatusBadge info={r.token.status} row={r.token} />
                    <span className="num text-micro text-ink-4">{formatBps(r.token.dailyRateBps)}</span>
                  </span>
                  {i === cursor && <CornerDownLeft size={12} className="shrink-0 text-ink-4" />}
                </div>
              )
            })}

          {!loading && query.trim() && results.length === 0 && (
            <div className="px-3.5 py-8 text-center">
              <p className="text-xs text-ink-3">{t('search.none', { q: query.trim() })}</p>
              <p className="mt-1 text-mini text-ink-4">{t('search.noneHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
