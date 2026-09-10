'use client'

/**
 * SHORTCOIN — client state.
 *
 * Deliberately NOT where prices live. Ticks arrive tens of times a second and
 * would re-render the entire terminal if they went through here; they are
 * delivered straight to the components that need them by `MarketEngine`
 * subscriptions. This store holds the slow-moving things: which direction the
 * user is trading, their fake wallet, and their fake book.
 */

import { useEffect } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { InversionMode, Order, OrderType, Position, Side, Wallet } from './types'
import { getAsset } from './assets'
import { liquidationPrice, unrealizedPnl } from './inversion'

const OPENING_BALANCE = 25_000

let idSeq = 0
const nextId = (p: string) => `${p}-${(idSeq += 1).toString(36)}`

/** Fake but stable connected wallet. */
const DEMO_WALLET: Wallet = {
  address: '0x7a3f9c21be04d5e8f6a1c9037bd82e4419f0cd6a',
  balance: OPENING_BALANCE,
  equity: OPENING_BALANCE,
  marginUsed: 0,
  realizedPnl: 0,
}

export interface OpenArgs {
  symbol: string
  side: Side
  /** Collateral in USD. */
  margin: number
  leverage: number
  /** Mark price of the UNDERLYING at fill time. */
  price: number
}

interface State {
  /** Direction the terminal is currently oriented to. Drives the whole accent. */
  mode: Side
  inversion: InversionMode
  /** Show the inverted (short) series on the chart instead of the underlying. */
  inverted: boolean

  wallet: Wallet
  positions: Position[]
  orders: Order[]
  watchlist: string[]

  /** Last symbol the user looked at, for the "resume" affordance in the nav. */
  lastSymbol: string | null

  setMode: (m: Side) => void
  toggleMode: () => void
  setInversion: (m: InversionMode) => void
  setInverted: (v: boolean) => void

  openPosition: (a: OpenArgs) => Position | null
  closePosition: (id: string, markPrice: number) => void
  closeAll: (marks: Record<string, number>) => void

  placeOrder: (o: Omit<Order, 'id' | 'status' | 'createdAt'>) => Order
  cancelOrder: (id: string) => void

  toggleWatch: (symbol: string) => void
  setLastSymbol: (s: string) => void
  reset: () => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
  mode: 'long',
  inversion: 'reciprocal',
  inverted: false,

  wallet: { ...DEMO_WALLET },
  positions: [],
  orders: [],
  watchlist: ['NVDA', 'TSLA', 'SPCX', 'COIN', 'MSTR'],
  lastSymbol: null,

  setMode: (mode) => {
    set({ mode, inverted: mode === 'short' })
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.mode = mode
    }
  },

  toggleMode: () => get().setMode(get().mode === 'long' ? 'short' : 'long'),

  setInversion: (inversion) => set({ inversion }),
  setInverted: (inverted) => set({ inverted }),

  openPosition: ({ symbol, side, margin, leverage, price }) => {
    const asset = getAsset(symbol)
    if (!asset || margin <= 0 || price <= 0) return null

    const { wallet } = get()
    if (margin > wallet.balance) return null

    const notionalUsd = margin * leverage
    const size = notionalUsd / price

    const position: Position = {
      id: nextId('pos'),
      symbol,
      side,
      entry: price,
      size,
      leverage,
      margin,
      liquidation: liquidationPrice(side, price, leverage),
      openedAt: Math.floor(Date.now() / 1000),
      fundingPaid: 0,
      borrowPaid: 0,
    }

    set({
      positions: [position, ...get().positions],
      wallet: {
        ...wallet,
        balance: wallet.balance - margin,
        marginUsed: wallet.marginUsed + margin,
      },
    })
    return position
  },

  closePosition: (id, markPrice) => {
    const { positions, wallet } = get()
    const pos = positions.find((p) => p.id === id)
    if (!pos) return

    const pnl = unrealizedPnl(pos.side, pos.entry, markPrice, pos.size)
    const fees = pos.fundingPaid + pos.borrowPaid
    // A liquidated position cannot return more than the collateral posted.
    const returned = Math.max(pos.margin + pnl + fees, 0)

    set({
      positions: positions.filter((p) => p.id !== id),
      wallet: {
        ...wallet,
        balance: wallet.balance + returned,
        marginUsed: Math.max(wallet.marginUsed - pos.margin, 0),
        realizedPnl: wallet.realizedPnl + (returned - pos.margin),
      },
    })
  },

  closeAll: (marks) => {
    get()
      .positions.map((p) => p.id)
      .forEach((id) => {
        const pos = get().positions.find((p) => p.id === id)
        if (pos) get().closePosition(id, marks[pos.symbol] ?? pos.entry)
      })
  },

  placeOrder: (o) => {
    const order: Order = {
      ...o,
      id: nextId('ord'),
      status: 'open',
      createdAt: Math.floor(Date.now() / 1000),
    }
    set({ orders: [order, ...get().orders] })
    return order
  },

  cancelOrder: (id) =>
    set({
      orders: get().orders.map((o) => (o.id === id ? { ...o, status: 'cancelled' as const } : o)),
    }),

  toggleWatch: (symbol) => {
    const w = get().watchlist
    set({ watchlist: w.includes(symbol) ? w.filter((s) => s !== symbol) : [symbol, ...w] })
  },

  setLastSymbol: (lastSymbol) => set({ lastSymbol }),

  reset: () =>
    set({
      wallet: { ...DEMO_WALLET },
      positions: [],
      orders: [],
    }),
    }),
    {
      name: 'shortcoin.book.v1',
      storage: createJSONStorage(() => localStorage),
      // Rehydration is deferred to `useRehydrateStore` below. Left automatic,
      // the client would render its saved book on the very first pass while the
      // server rendered an empty one, and React would tear the tree down.
      skipHydration: true,
      // The book and the wallet survive a reload; transient view state does not,
      // so the terminal always opens in a known orientation.
      partialize: (s) => ({
        wallet: s.wallet,
        positions: s.positions,
        orders: s.orders,
        watchlist: s.watchlist,
        inversion: s.inversion,
      }),
    },
  ),
)

/** Order types the ticket offers. */
export const ORDER_TYPES: OrderType[] = ['market', 'limit', 'stop']

/** Leverage presets. 1x is included so the product is usable unlevered. */
export const LEVERAGE_PRESETS = [1, 2, 3, 5, 10, 20]

/** Quick-size presets in USD, mirroring gmgn's one-click buy buttons. */
export const SIZE_PRESETS = [50, 100, 250, 500, 1000, 2500]

/**
 * Pulls the saved book out of localStorage once, after mount. Called by the app
 * shell so every screen sees the same state on the same frame.
 */
export function useRehydrateStore() {
  useEffect(() => {
    void useStore.persist.rehydrate()
  }, [])
}
