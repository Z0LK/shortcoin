'use client'

/**
 * SPEC §7.6 — a knocked-out user who was not warned is a lost user.
 *
 * Every protocol event becomes a toast. Knock-outs and settlements always
 * show and stay until dismissed, with a link straight to the receipt; barrier
 * approaches show only when the person has left alerts on, and fade. The
 * browser's own notification is used too when permission has been granted,
 * because the moment that matters is usually the moment the tab is hidden.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, X, Zap } from 'lucide-react'
import { useProtocolEvents, useRuntime } from '@/components/protocol/provider'
import { formatPct, formatUsdg } from '@/lib/protocol/fixed'
import { useStore } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { resolveAsset } from '@/lib/universe'
import { cn } from '@/lib/utils'
import type { ProtocolEvent } from '@/lib/protocol/types'

interface Toast {
  id: number
  tone: 'short' | 'long' | 'warn' | 'info'
  title: string
  body: string
  href?: string
  sticky: boolean
}

let seq = 0

/**
 * Fire a toast from anywhere — used for the confirmation that ends an action
 * the user started, which is not a protocol event.
 */
export function notify(toast: { tone: 'short' | 'long' | 'warn' | 'info'; title: string; body: string; href?: string }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('shortcoin:toast', { detail: toast }))
}

function symbolFor(address: string): string {
  return resolveAsset(address)?.symbol ?? address.slice(0, 8)
}

export function Notifications() {
  const { t } = useT()
  const rt = useRuntime()
  const alerts = useStore((s) => s.barrierAlerts)
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = ++seq
    setToasts((all) => [{ ...toast, id }, ...all].slice(0, 5))
    if (!toast.sticky) setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 7000)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      new Notification(toast.title, { body: toast.body })
    }
  }, [])

  const symbolOf = (address: string) => rt?.paper?.symbolOf(address) ?? symbolFor(address)

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<Toast, 'id' | 'sticky'>
      push({ ...d, sticky: false })
    }
    window.addEventListener('shortcoin:toast', onToast)
    return () => window.removeEventListener('shortcoin:toast', onToast)
  }, [push])

  useProtocolEvents((e: ProtocolEvent) => {
    switch (e.type) {
      case 'position.knockout':
        push({
          tone: 'short',
          title: t('notify.knockout', { symbol: symbolOf(e.position.token) }),
          body: t('notify.knockoutBody', { amount: formatUsdg(e.position.collateral) }),
          href: `/receipts/${e.receiptId}`,
          sticky: true,
        })
        break
      case 'position.settled':
        push({
          tone: 'long',
          title: t('notify.settled', { symbol: symbolOf(e.position.token) }),
          body: t('notify.settledBody', { amount: formatUsdg(e.position.equity > 0n ? e.position.equity : 0n) }),
          href: `/receipts/${e.receiptId}`,
          sticky: true,
        })
        break
      case 'position.barrier-approach':
        if (!alerts) return
        push({
          tone: 'warn',
          title: t('notify.approach', {
            symbol: symbolOf(e.position.token),
            pct: formatPct(e.distancePct, 1),
          }),
          body: t('notify.approachBody'),
          href: '/positions',
          sticky: false,
        })
        break
      case 'position.payout-eligible':
        push({
          tone: 'info',
          title: t('notify.eligible', { symbol: symbolOf(e.position.token) }),
          body: t('notify.eligibleBody'),
          href: '/positions',
          sticky: false,
        })
        break
    }
  })

  if (!toasts.length) return null

  const ICON = { short: Zap, long: CheckCircle2, warn: AlertTriangle, info: Clock }
  const TONE = {
    short: 'border-short/50 text-short',
    long: 'border-long/50 text-long',
    warn: 'border-warn/50 text-warn',
    info: 'border-info/50 text-info',
  }

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-2 bottom-2 z-[55] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[360px]"
    >
      {toasts.map((toast) => {
        const Icon = ICON[toast.tone]
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex gap-3 rounded-lg border bg-overlay p-3 shadow-2xl shadow-black/50',
              TONE[toast.tone],
            )}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink">{toast.title}</p>
              <p className="mt-0.5 text-mini text-ink-3">{toast.body}</p>
              {toast.href && (
                <Link href={toast.href} className="mt-1.5 inline-block text-mini font-semibold text-info hover:underline">
                  {toast.href.startsWith('/receipts') ? t('notify.viewReceipt') : t('nav.positions')}
                </Link>
              )}
            </div>
            <button
              onClick={() => setToasts((all) => all.filter((x) => x.id !== toast.id))}
              aria-label={t('notify.dismiss')}
              className="self-start text-ink-4 hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
