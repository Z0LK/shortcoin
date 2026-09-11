'use client'

/**
 * i18n, from the start (SPEC §7.8).
 *
 * Deliberately small: two flat dictionaries, one hook, `{var}` interpolation.
 * A financial UI is full of composed strings — "Payout in {time}", "{pct} of
 * supply" — and the cost of retrofitting them is in finding them, not in the
 * library. Every user-facing string in the product goes through `t()`.
 *
 * French is the reference language; English must have every key (the type
 * checker enforces it).
 */

import { useCallback } from 'react'
import { useStore } from '../store'
import { fr, type MessageKey } from './fr'
import { en } from './en'

export type Locale = 'fr' | 'en'
export type { MessageKey }

const DICTS: Record<Locale, Record<MessageKey, string>> = { fr, en }

export type Vars = Record<string, string | number>

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const template = DICTS[locale][key] ?? fr[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  )
}

export function useT() {
  const locale = useStore((s) => s.locale)
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(locale, key, vars), [locale])
  return { t, locale }
}

/** "2 h 14 min", "45 s" — for countdowns. */
export function useDuration() {
  const { t } = useT()
  return useCallback(
    (ms: number) => {
      const s = Math.max(Math.ceil(ms / 1000), 0)
      if (s < 60) return t('common.seconds', { n: s })
      const m = Math.floor(s / 60)
      if (m < 60) return `${t('common.minutes', { n: m })} ${t('common.seconds', { n: s % 60 })}`
      const h = Math.floor(m / 60)
      if (h < 48) return `${t('common.hours', { n: h })} ${t('common.minutes', { n: m % 60 })}`
      return t('common.days', { n: Math.floor(h / 24) })
    },
    [t],
  )
}
