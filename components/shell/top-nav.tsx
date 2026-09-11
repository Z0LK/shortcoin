'use client'

/**
 * Top bar.
 *
 * Carries the three things that must be visible on every screen: which mode
 * this is (paper never passes for mainnet), the USDG balance, and the way to
 * search. Plus the language switch (§7.8) and the barrier-alert toggle (§7.6).
 *
 * On a phone the links collapse into a horizontally scrolling strip under the
 * brand rather than a hamburger — three destinations do not need a menu.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, BellOff, Search, Wallet2 } from 'lucide-react'
import { Wordmark } from '@/components/shell/brand'
import { useAdapterQuery, useRuntime } from '@/components/protocol/provider'
import { formatUsdg } from '@/lib/protocol/fixed'
import { useStore } from '@/lib/store'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const LINKS: { href: string; key: MessageKey }[] = [
  { href: '/', key: 'nav.scanner' },
  { href: '/positions', key: 'nav.positions' },
  { href: '/hlp', key: 'nav.hlp' },
  { href: '/how-it-works', key: 'nav.howItWorks' },
]

export function TopNav() {
  const { t, locale } = useT()
  const pathname = usePathname()
  const rt = useRuntime()
  const setLocale = useStore((s) => s.setLocale)
  const alerts = useStore((s) => s.barrierAlerts)
  const setAlerts = useStore((s) => s.setBarrierAlerts)
  const account = useAdapterQuery((a) => a.account(), [], { everyMs: 2000 })
  const positions = useAdapterQuery((a) => a.listPositions(), [], { everyMs: 3000 })
  const openCount = (positions.data ?? []).filter((p) => p.status === 'OPEN').length

  const mode = rt?.mode ?? 'paper'
  const openSearch = () => window.dispatchEvent(new CustomEvent('shortcoin:command-palette'))

  const toggleAlerts = async () => {
    const next = !alerts
    setAlerts(next)
    // Ask for the browser's permission the first time alerts are turned on, so
    // a knock-out can still reach someone whose tab is in the background.
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }

  return (
    <header className="relative z-30 flex shrink-0 flex-col border-b border-line bg-surface">
      <div className="flex h-[var(--nav-h)] items-center gap-3 px-3">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        <span
          title={t('nav.mode.paper.hint')}
          className={cn(
            'num rounded-[3px] border px-1.5 py-[1px] text-micro font-bold tracking-[0.08em]',
            mode === 'mainnet' ? 'border-long/40 text-long' : 'border-warn/50 bg-warn/10 text-warn',
          )}
        >
          {t(`nav.mode.${mode}` as MessageKey)}
        </span>

        <nav className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'relative rounded-[5px] px-2.5 py-1.5 text-xs font-medium transition-colors',
                  active ? 'bg-raised text-ink' : 'text-ink-3 hover:bg-raised/60 hover:text-ink-2',
                )}
              >
                {t(l.key)}
                {l.href === '/positions' && openCount > 0 && (
                  <span className="num ml-1 rounded-[3px] bg-short/15 px-1 text-micro font-bold text-short">{openCount}</span>
                )}
              </Link>
            )
          })}
        </nav>

        <button
          onClick={openSearch}
          className="ml-auto flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[5px] border border-line bg-sunken px-2.5 text-left text-xs text-ink-3 transition-colors hover:border-line-strong sm:max-w-[360px]"
          aria-label={t('nav.search')}
        >
          <Search size={13} className="shrink-0" />
          <span className="hidden flex-1 truncate sm:inline">{t('nav.search')}</span>
          <kbd className="num hidden rounded-[3px] border border-line bg-raised px-1.5 py-0.5 text-micro text-ink-3 lg:inline">
            ⌘K
          </kbd>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <div
            className="hidden h-8 items-center gap-2 rounded-[5px] border border-line bg-sunken px-2.5 sm:flex"
            title={t('nav.balance')}
          >
            <Wallet2 size={13} className="text-ink-3" />
            <span className="num text-mini font-semibold">{formatUsdg(account.data?.usdgBalance ?? 0n)}</span>
          </div>

          <button
            onClick={toggleAlerts}
            aria-pressed={alerts}
            title={t('nav.alerts')}
            aria-label={t('nav.alerts')}
            className={cn(
              'grid size-8 place-items-center rounded-[5px] border border-line bg-sunken transition-colors',
              alerts ? 'text-warn' : 'text-ink-4',
            )}
          >
            {alerts ? <Bell size={13} /> : <BellOff size={13} />}
          </button>

          <button
            onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
            title={t('nav.language')}
            className="num grid h-8 w-10 place-items-center rounded-[5px] border border-line bg-sunken text-micro font-bold text-ink-2 hover:text-ink"
          >
            {locale === 'fr' ? 'EN' : 'FR'}
          </button>
        </div>
      </div>

      {/* Phone: the links, as a strip. */}
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-2 py-1 md:hidden">
        {LINKS.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'whitespace-nowrap rounded-[4px] px-2.5 py-1 text-mini font-medium',
                active ? 'bg-raised text-ink' : 'text-ink-3',
              )}
            >
              {t(l.key)}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
