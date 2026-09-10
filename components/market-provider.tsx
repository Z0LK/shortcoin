'use client'

/**
 * Owns the single fake market for the whole app.
 *
 * Ticks are pushed to subscribers directly and never routed through React
 * state at the top of the tree — a 60-row scanner updating through a context
 * value would re-render every row on every print. Components subscribe to the
 * one symbol they care about and hold their own tiny piece of state.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ASSETS } from '@/lib/assets'
import { MarketEngine, type Interval, type Tick } from '@/lib/sim'
import type { Asset } from '@/lib/types'

const MarketContext = createContext<MarketEngine | null>(null)

export function MarketProvider({ children }: { children: ReactNode }) {
  // Built once, on the client, so the server never simulates anything.
  const engine = useMemo(() => new MarketEngine(ASSETS, '1m', 700), [])

  useEffect(() => {
    engine.start()
    const onVisibility = () => {
      if (document.hidden) engine.stop()
      else engine.start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      engine.stop()
    }
  }, [engine])

  return <MarketContext.Provider value={engine}>{children}</MarketContext.Provider>
}

export function useMarket(): MarketEngine | null {
  return useContext(MarketContext)
}

/** Subscribe to a symbol without re-rendering: the callback gets every tick. */
export function useTickHandler(symbol: string | null, handler: (t: Tick) => void) {
  const engine = useMarket()
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!engine || !symbol) return
    return engine.subscribe(symbol, (t) => ref.current(t))
  }, [engine, symbol])
}

export interface LivePrice {
  price: number
  /** +1 up, −1 down, 0 unchanged — drives the tick flash. */
  dir: number
  /** Increments on every print, so a flash can be re-keyed. */
  seq: number
}

/**
 * Live price for one symbol, re-rendering only the component that calls it.
 * The first render deliberately returns the seed price so SSR and hydration
 * agree; movement starts on the first tick after mount.
 */
export function useLivePrice(asset: Asset): LivePrice {
  const [state, setState] = useState<LivePrice>({ price: asset.price, dir: 0, seq: 0 })
  const last = useRef(asset.price)

  useTickHandler(asset.symbol, (t) => {
    const dir = t.price > last.current ? 1 : t.price < last.current ? -1 : 0
    last.current = t.price
    setState((s) => ({ price: t.price, dir, seq: s.seq + 1 }))
  })

  return state
}

/** Interval selection is app-wide so the chart and the engine stay in step. */
export function useEngineInterval(interval: Interval) {
  const engine = useMarket()
  useEffect(() => {
    engine?.setInterval_(interval)
  }, [engine, interval])
}
