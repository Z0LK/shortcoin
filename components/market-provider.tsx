'use client'

/**
 * Owns the single fake market for the whole app.
 *
 * Ticks are pushed to subscribers directly and never routed through React
 * state at the top of the tree — a 60-row scanner updating through a context
 * value would re-render every row on every print. Components subscribe to the
 * one symbol they care about and hold their own tiny piece of state.
 */

import { useEffect, useRef, useState } from 'react'
import { useRuntime } from '@/components/protocol/provider'
import type { Interval, MarketEngine, Tick } from '@/lib/sim'
import type { Asset } from '@/lib/types'

/**
 * The spot engine is owned by the protocol runtime, so the paper adapter and
 * every price cell on screen read the same ticks. On testnet and mainnet the
 * engine is idle and the indexer supplies prices instead.
 */
export function useMarket(): MarketEngine | null {
  return useRuntime()?.engine ?? null
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
export function useLivePrice(asset: Pick<Asset, 'symbol' | 'price'>): LivePrice {
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
