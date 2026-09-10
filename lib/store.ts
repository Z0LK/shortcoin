'use client'

/**
 * SHORTCOIN — client state.
 *
 * There is no trading direction to hold: the product only sells, and the chart
 * is always the inverse. What used to be a mode switch is now an invariant.
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
import type { InversionMode, Order, OrderType, Position, Wallet } from './types'
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
  /** Collateral in USD. Unlevered, so this is also the notional. */
  margin: number
  /** Mark price of the UNDERLYING at fill time. */
  price: number
}

interface State {
  inversion: InversionMode

  wallet: Wallet
  positions: Position[]
  orders: Order[]
  watchlist: string[]

  /** Last symbol the user looked at, for the "resume" affordance in the nav. */
  lastSymbol: string | null

  setInversion: (m: InversionMode) => void

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
  inversion: 'reciprocal',

  wallet: { ...DEMO_WALLET },
  positions: [],
  orders: [],
  watchlist: ['NVDA', 'TSLA', 'SPCX', 'COIN', 'MSTR'],
  lastSymbol: null,

  setInversion: (inversion) => set({ inversion }),

  openPosition: ({ symbol, margin, price }) => {
    const asset = getAsset(symbol)
    if (!asset || margin <= 0 || price <= 0) return null

    const { wallet } = get()
    if (margin > wallet.balance) return null

    // Unlevered: the collateral IS the notional, so a $250 ticket sells $250
    // of stock. Liquidation therefore sits just under twice the entry — the
    // point at which the position has lost everything posted against it.
    const size = margin / price

    const position: Position = {
      id: nextId('pos'),
      symbol,
      side: 'short',
      entry: price,
      size,
      margin,
      liquidation: liquidationPrice('short', price, 1),
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
