'use client'

/**
 * SPEC §4E — the risk portal.
 *
 * Blocking, once, three boxes, three sentences. Not a legal wall: each box is a
 * consequence the person will actually live through — the knock-out, the
 * premium eating the collateral, and a settlement price that will not match
 * what they see on DexScreener. Nothing continues until all three are ticked.
 */

import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useStore } from '@/lib/store'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const POINTS: MessageKey[] = ['risk.1', 'risk.2', 'risk.3']

export function RiskPortal() {
  const { t } = useT()
  const acknowledged = useStore((s) => s.riskAcknowledgedAt)
  const acknowledge = useStore((s) => s.acknowledgeRisk)
  const [checked, setChecked] = useState([false, false, false])

  // The store rehydrates after mount; until it has, there is no way to know
  // whether this person has already seen the portal, so render nothing.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true))
    if (useStore.persist.hasHydrated()) setHydrated(true)
    return unsub
  }, [])

  if (!hydrated || acknowledged) return null
  const ready = checked.every(Boolean)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="risk-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4"
    >
      <div className="panel w-full max-w-[460px] rounded-b-none bg-overlay p-5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] sm:rounded-b-[6px]">
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert size={18} className="text-short" />
          <h2 id="risk-title" className="text-base font-semibold">
            {t('risk.title')}
          </h2>
        </div>

        <div className="flex flex-col gap-2.5">
          {POINTS.map((key, i) => (
            <label
              key={key}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-[4px] border p-3 transition-colors',
                checked[i] ? 'border-short/40 bg-short/5' : 'border-line bg-sunken hover:border-line-strong',
              )}
            >
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={(e) => setChecked((c) => c.map((v, j) => (j === i ? e.target.checked : v)))}
                className="mt-0.5 size-4 shrink-0 accent-[var(--sig)]"
              />
              <span className="text-sm leading-snug text-ink">{t(key)}</span>
            </label>
          ))}
        </div>

        <button
          disabled={!ready}
          onClick={acknowledge}
          className="mt-5 h-11 w-full btn-primary text-sm"
        >
          {t('risk.accept')}
        </button>
      </div>
    </div>
  )
}
