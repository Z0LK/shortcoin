'use client'

/**
 * ⌘K. Symbol search.
 *
 * Keyboard-first because the target user does not reach for a mouse to change
 * chart. Opening it is also how the header search behaves, so there is exactly
 * one search surface in the product.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, Search } from 'lucide-react'
import { ASSETS } from '@/lib/assets'
import { pct, price } from '@/lib/format'
import { cn } from '@/lib/utils'

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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? ASSETS.filter(
          (a) =>
            a.symbol.toLowerCase().includes(q) ||
            a.name.toLowerCase().includes(q) ||
            (a.underlying ?? '').toLowerCase().includes(q),
        )
      : ASSETS
    return pool.slice(0, 9)
  }, [query])

  const commit = (i: number) => {
    const asset = results[i]
    if (!asset) return
    router.push(`/t/${asset.symbol}`)
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
                commit(cursor)
              }
            }}
            placeholder="Search a token, ticker or contract…"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
          />
          <kbd className="num rounded-[3px] border border-line px-1.5 py-0.5 text-micro text-ink-4">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <p className="px-3.5 py-8 text-center text-xs text-ink-3">
              Nothing matches “{query}”.
            </p>
          )}

          {results.map((asset, i) => (
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
              <span className="w-[86px] shrink-0 text-xs font-semibold text-ink">
                {asset.symbol}
              </span>
              <span className="flex-1 truncate text-xs text-ink-3">{asset.name}</span>
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
          ))}
        </div>
      </div>
    </div>
  )
}
