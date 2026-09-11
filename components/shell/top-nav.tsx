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
    <header className="relative z-30 flex shrink-0 flex-col border-b border-line bg-[rgba(5,6,14,0.72)] backdrop-blur-[18px]">
      <div className="flex h-[var(--nav-h)] items-center gap-3 px-3 sm:gap-4 sm:px-5">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        <span
          title={t('nav.mode.paper.hint')}
          className={cn(
            'mono flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-medium',
            mode === 'mainnet' ? 'border-long/40 text-long' : 'border-warn/40 bg-warn/[0.06] text-warn',
          )}
        >
          <span className="pulse-dot size-1.5 rounded-full bg-current" />
          {t(`nav.mode.${mode}` as MessageKey)}
        </span>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'group relative px-2.5 py-2 text-[13px] font-medium transition-colors',
                  active ? 'text-ink' : 'text-ink-3 hover:text-ink',
                )}
              >
                {t(l.key)}
                {l.href === '/positions' && openCount > 0 && (
                  <span className="num ml-1.5 rounded-full bg-sig px-1.5 py-px text-micro font-medium text-accent-ink">{openCount}</span>
                )}
                <span
                  className={cn(
                    'absolute inset-x-2.5 -bottom-px h-px origin-left bg-sig transition-transform duration-300',
                    active ? 'scale-x-100 shadow-[0_0_12px_rgba(138,123,255,0.75)]' : 'scale-x-0 group-hover:scale-x-100',
                  )}
                />
              </Link>
            )
          })}
        </nav>

        <button
          onClick={openSearch}
          className="btn-ghost ml-auto flex h-9 min-w-0 flex-1 items-center gap-2 px-3.5 text-left text-xs text-ink-3 sm:max-w-[360px]"
          aria-label={t('nav.search')}
        >
          <Search size={13} className="shrink-0" />
          <span className="hidden flex-1 truncate sm:inline">{t('nav.search')}</span>
          <kbd className="num hidden rounded-full border border-line bg-raised px-2 py-0.5 text-micro text-ink-3 lg:inline">
            ⌘K
          </kbd>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <div
            className="hidden h-9 items-center gap-2 rounded-full border border-line-sig bg-sig/[0.05] px-3.5 sm:flex"
            title={t('nav.balance')}
          >
            <Wallet2 size={13} className="text-sig" />
            <span className="num text-mini font-semibold">{formatUsdg(account.data?.usdgBalance ?? 0n)}</span>
          </div>

          <button
            onClick={toggleAlerts}
            aria-pressed={alerts}
            title={t('nav.alerts')}
            aria-label={t('nav.alerts')}
            className={cn(
              'btn-ghost grid size-9 place-items-center',
              alerts ? 'text-warn' : 'text-ink-4',
            )}
          >
            {alerts ? <Bell size={13} /> : <BellOff size={13} />}
          </button>

          <button
            onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
            title={t('nav.language')}
            className="btn-ghost mono grid h-9 w-11 place-items-center text-[10px] font-medium"
          >
            {locale === 'fr' ? 'EN' : 'FR'}
          </button>
        </div>
      </div>

      {/* Phone: the links, as a strip. */}
      <nav className="flex gap-1.5 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden">
        {LINKS.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'whitespace-nowrap rounded-full border px-3 py-1 text-mini font-medium',
                active ? 'border-line-sig bg-sig/[0.08] text-sig' : 'border-transparent text-ink-3',
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
