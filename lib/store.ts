'use client'

/**
 * UI preferences. Nothing about money lives here any more.
 *
 * Balances, positions, quotes and receipts belong to the protocol adapter —
 * in paper mode it persists them itself, on testnet and mainnet they come from
 * the indexer. This store only remembers how the person likes the screen:
 * language, units, watchlist, whether they have seen the risk portal, and
 * whether they want barrier alerts.
 */

import { useEffect } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DisplayUnit } from './types'
import type { Locale } from './i18n'

interface State {
  locale: Locale
  setLocale: (l: Locale) => void

  /** Chart denomination. Market cap by default — see DisplayUnit. */
  unit: DisplayUnit
  setUnit: (u: DisplayUnit) => void

  watchlist: string[]
  toggleWatch: (symbol: string) => void

  /** SPEC §4E: the risk portal is shown once, then never again. */
  riskAcknowledgedAt: number | null
  acknowledgeRisk: () => void

  /** SPEC §7.6: barrier-approach alerts are optional; knock-outs are not. */
  barrierAlerts: boolean
  setBarrierAlerts: (v: boolean) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      locale: 'fr',
      setLocale: (locale) => {
        set({ locale })
        if (typeof document !== 'undefined') document.documentElement.lang = locale
      },

      unit: 'mcap',
      setUnit: (unit) => set({ unit }),

      watchlist: ['NVDA', 'TSLA', 'SPCX', 'PONS', 'CASHCAT'],
      toggleWatch: (symbol) => {
        const w = get().watchlist
        set({ watchlist: w.includes(symbol) ? w.filter((s) => s !== symbol) : [symbol, ...w] })
      },

      riskAcknowledgedAt: null,
      acknowledgeRisk: () => set({ riskAcknowledgedAt: Date.now() }),

      barrierAlerts: true,
      setBarrierAlerts: (barrierAlerts) => set({ barrierAlerts }),
    }),
    {
      name: 'shortcoin.prefs.v2',
      storage: createJSONStorage(() => localStorage),
      // Rehydrated after mount by useRehydrateStore; left automatic, the saved
      // locale would render on the client's first pass and not the server's.
      skipHydration: true,
    },
  ),
)

export function useRehydrateStore() {
  useEffect(() => {
    void useStore.persist.rehydrate()
    document.documentElement.lang = useStore.getState().locale
  }, [])
}
