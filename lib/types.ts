/**
 * SHORTCOIN — core domain types.
 *
 * Everything here is FICTIONAL for now: prices, fills, balances and chain state
 * are simulated in the browser. The shapes are chosen so that a real backend
 * (Robinhood Chain RPC + an orderbook/perp venue) can be swapped in behind
 * `lib/market.ts` without touching a single component.
 */

/** Unix timestamp in SECONDS (lightweight-charts uses seconds, not ms). */
export type UtcSeconds = number

export type Side = 'long' | 'short'

/** Which synthetic-inverse transform is applied to build the short instrument. */
export type InversionMode = 'reciprocal' | 'mirror' | 'compound'

/**
 * Sector as the Robinhood Chain asset registry spells it — "Semiconductors",
 * "Space & Satellite", "ETF - Bonds" and so on. Left as a string rather than a
 * union because the taxonomy is the issuer's to change, not ours.
 */
export type Sector = string

/**
 * Whether a token can be shorted anywhere today, before SHORTCOIN exists.
 *   borrow — a spot borrow market exists (5 tokens, all with nothing supplied)
 *   perp   — a perpetual future is listed somewhere (44 tokens)
 *   none   — no route at all (150 tokens, 77% of the chain)
 * This field is the product's entire reason for being, so it is first-class.
 */
export type ShortRoute = 'borrow' | 'perp' | 'none'

/** Whether the underlying equity's primary venue is currently open. */
export type MarketPhase = 'open' | 'pre' | 'after' | 'closed'

export interface Candle {
  time: UtcSeconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Asset {
  /**
   * On-chain ERC-20 symbol. On Robinhood Chain this is the BARE ticker — the
   * contract at 0xaF3D…93f9 returns "AAPL", not "AAPLx" or "rAAPL".
   */
  symbol: string
  /** Underlying listed ticker. Same as `symbol` for tokenized equities. */
  underlying?: string
  name: string
  /** The on-chain ERC-20 name, e.g. "Apple • Robinhood Token". */
  tokenName: string
  sector: Sector
  /** True for tokenized private companies such as SpaceX. */
  private: boolean
  /** 0x… address on Robinhood Chain. */
  address: string
  /** True when the address was read from the chain rather than generated. */
  verifiedAddress: boolean
  logoHue: number

  price: number
  /** Session open, used as the default inversion anchor. */
  anchor: number
  change1h: number
  change24h: number
  change7d: number
  volume24h: number
  liquidity: number
  marketCap: number
  holders: number
  /** Annualised borrow fee charged to short positions, e.g. 0.0325 = 3.25%. */
  borrowFee: number
  /** Per-8h funding rate. Positive = longs pay shorts. */
  fundingRate: number
  /** Fraction of open interest that is short, 0..1. */
  shortInterest: number
  openInterest: number
  phase: MarketPhase
  /** Realised volatility used by the tick simulator. */
  vol: number
  /** Drift used by the tick simulator. */
  drift: number

  /** How, if at all, this token can be shorted without SHORTCOIN. */
  shortRoute: ShortRoute
  /** Accepted as lending collateral but not borrowable — long leverage only. */
  collateralOnly: boolean
  /** Issuer has disabled fractional trading for this token. */
  wholeSharesOnly: boolean
  /**
   * ERC-8056 scaled-UI multiplier. Display balance is
   * rawBalanceOf(addr) * uiMultiplier / 1e18, which is how the issuer applies
   * splits and corporate actions without moving anyone's tokens.
   */
  uiMultiplier: number
}

export interface Position {
  id: string
  symbol: string
  side: Side
  /** Entry price expressed in UNDERLYING units, never inverted units. */
  entry: number
  /** Position size in underlying units. */
  size: number
  leverage: number
  /** Collateral posted, in USD. */
  margin: number
  liquidation: number
  openedAt: UtcSeconds
  /** Cumulative funding paid (negative) or received (positive), USD. */
  fundingPaid: number
  borrowPaid: number
}

export type OrderType = 'market' | 'limit' | 'stop'
export type OrderStatus = 'open' | 'filled' | 'cancelled'

export interface Order {
  id: string
  symbol: string
  side: Side
  type: OrderType
  price: number
  size: number
  leverage: number
  status: OrderStatus
  createdAt: UtcSeconds
}

export interface Trade {
  id: string
  symbol: string
  side: Side
  price: number
  size: number
  time: UtcSeconds
  /** Fictional trader wallet, truncated for display. */
  wallet: string
  /** Marks wallets the user follows / smart money. */
  tag?: 'smart' | 'whale' | 'you' | 'fresh'
}

export interface Holder {
  wallet: string
  pct: number
  value: number
  tag?: 'treasury' | 'market-maker' | 'whale' | 'you'
}

export interface Wallet {
  address: string
  /** USDC balance in USD. Fictional. */
  balance: number
  equity: number
  marginUsed: number
  realizedPnl: number
}
