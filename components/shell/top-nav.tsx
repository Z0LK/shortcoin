'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowDownRight, Search, Settings, Wallet2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Wordmark } from '@/components/shell/brand'
import { useStore } from '@/lib/store'
import { marketPhase, PHASE_LABEL } from '@/lib/assets'
import { usd } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MarketPhase } from '@/lib/types'

const LINKS = [
  { href: '/', label: 'Scanner' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/how-it-works', label: 'How shorting works' },
]

const PHASE_TONE: Record<MarketPhase, string> = {
  open: 'text-long',
  pre: 'text-warn',
  after: 'text-warn',
  closed: 'text-ink-3',
}

export function TopNav() {
  const pathname = usePathname()
  const wallet = useStore((s) => s.wallet)
  const positions = useStore((s) => s.positions)

  // Phase depends on wall-clock time, so it is resolved after mount to keep the
  // server and the first client render identical.
  const [phase, setPhase] = useState<MarketPhase | null>(null)
  useEffect(() => {
    const update = () => setPhase(marketPhase())
    update()
    const t = setInterval(update, 30_000)
    return () => clearInterval(t)
  }, [])

  const openCommand = () =>
    window.dispatchEvent(new CustomEvent('shortcoin:command-palette', { detail: true }))

  return (
    <header className="relative z-30 flex h-[var(--nav-h)] shrink-0 items-center gap-4 border-b border-line bg-surface px-3">
      <Link href="/" className="shrink-0">
        <Wordmark />
      </Link>

      <nav className="flex items-center gap-0.5">
        {LINKS.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-[5px] px-2.5 py-1.5 text-xs font-medium transition-colors',
                active ? 'bg-raised text-ink' : 'text-ink-3 hover:bg-raised/60 hover:text-ink-2',
              )}
            >
              {l.label}
            </Link>
          )
        })}
      </nav>

      <button
        onClick={openCommand}
        className="group ml-1 flex h-7 min-w-[240px] flex-1 max-w-[380px] items-center gap-2 rounded-[5px] border border-line bg-sunken px-2.5 text-left text-xs text-ink-3 transition-colors hover:border-line-strong"
      >
        <Search size={13} className="shrink-0" />
        <span className="flex-1 truncate">Search a token, ticker or contract…</span>
        <kbd className="num rounded-[3px] border border-line bg-raised px-1.5 py-0.5 text-micro text-ink-3">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-1.5 text-mini lg:flex">
          <span
            className={cn(
              'size-1.5 rounded-full bg-current',
              phase === 'open' && 'pulse-dot',
              phase ? PHASE_TONE[phase] : 'text-ink-4',
            )}
          />
          <span className={cn('font-medium', phase ? PHASE_TONE[phase] : 'text-ink-4')}>
            {phase ? PHASE_LABEL[phase] : '—'}
          </span>
          <span className="text-ink-4">·</span>
          <span className="text-ink-3">Tokens trade 24/7</span>
        </span>

        <span
          className="num flex h-7 items-center gap-1.5 rounded-[5px] border border-short/40 bg-short/10 px-2.5 text-mini font-bold tracking-[0.08em] text-short"
          title="SHORTCOIN only sells. Every chart is the inverse instrument and every fill is a short."
        >
          <ArrowDownRight size={12} />
          SHORT ONLY
        </span>

        <div className="flex h-7 items-center gap-2 rounded-[5px] border border-line bg-sunken px-2.5">
          <Wallet2 size={13} className="text-ink-3" />
          <span className="num text-mini font-semibold">{usd(wallet.balance)}</span>
          {positions.length > 0 && (
            <span className="num rounded-[3px] bg-accent-soft px-1.5 text-micro font-bold text-accent">
              {positions.length}
            </span>
          )}
        </div>

        <button
          className="grid size-7 place-items-center rounded-[5px] border border-line bg-sunken text-ink-3 transition-colors hover:text-ink"
          aria-label="Settings"
        >
          <Settings size={13} />
        </button>
      </div>
    </header>
  )
}
