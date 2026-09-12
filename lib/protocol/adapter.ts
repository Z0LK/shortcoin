/**
 * The protocol adapter.
 *
 * SPEC §7.4: `MODE = paper | testnet | mainnet`, same UI on all three, and
 * paper mode is an implementation of this interface — not a parallel code
 * path, or it diverges within a week. Every screen talks to a ProtocolAdapter
 * and has no idea which one it got.
 *
 * Reads are the indexer's job (§7.2: the front never reads the chain to build
 * a list). Writes go through `simulate*` first, then send, and failures come
 * back as a ProtocolError with a decoded reason rather than a raw revert.
 */

import type {
  Account,
  Address,
  HlpAccount,
  HlpState,
  OpenQuote,
  Position,
  PriceSample,
  ProtocolEvent,
  SearchResult,
  SettlementReceipt,
  TokenRow,
  Holding,
  SwapQuote,
  SwapSide,
  Trade,
} from './types'

export type TokenSort = 'capacity' | 'rate' | 'depth'

export interface TokenQuery {
  /** SPEC §3: "ouvrables maintenant" is the default filter. */
  openableOnly?: boolean
  sort?: TokenSort
  addresses?: string[]
  /** The launch tape, newest first. An indexer query, not a chain read. */
  newest?: { offset: number; limit: number }
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Price history for the token sheet chart: the spot candles and the two TWAP
 * series overlaid on them (§4A). Display data, so floats are acceptable here —
 * nothing in it is settled against.
 */
export interface PriceHistory {
  candles: Candle[]
  twap24h: { time: number; value: number }[]
  twap72h: { time: number; value: number }[]
}

export type HistoryInterval = '5m' | '15m' | '1h' | '4h'

export interface ProtocolAdapter {
  readonly mode: Mode

  // ── reads (indexer) ─────────────────────────────────────────────────────
  account(): Promise<Account>
  listTokens(query?: TokenQuery): Promise<TokenRow[]>
  getToken(addressOrSymbol: string): Promise<TokenRow | null>
  search(input: string): Promise<SearchResult[]>
  history(token: Address, interval: HistoryInterval): Promise<PriceHistory>

  listPositions(): Promise<Position[]>
  getPosition(id: string): Promise<Position | null>
  /** The samples that marked a position — shown in its detail view (§4B). */
  positionSamples(id: string): Promise<PriceSample[]>

  listReceipts(): Promise<SettlementReceipt[]>
  getReceipt(positionId: string): Promise<SettlementReceipt | null>

  hlp(): Promise<{ pool: HlpState; account: HlpAccount }>

  /** Spot tokens held by the account, marked at spot. */
  listHoldings(): Promise<Holding[]>
  /** Spot fills, newest first. */
  listTrades(): Promise<Trade[]>

  // ── quoting ─────────────────────────────────────────────────────────────
  /** Throws a ProtocolError when the token cannot be opened. */
  quoteOpen(token: Address, collateral: bigint): Promise<OpenQuote>
  /** Spot swap against the pool: USDG in when buying, token units in when selling. */
  quoteSwap(token: Address, side: SwapSide, amountIn: bigint, slippageBps: number): Promise<SwapQuote>

  // ── writes ──────────────────────────────────────────────────────────────
  /** Simulate before sending (§7.5). Resolves to null when the call would pass. */
  simulateOpen(quote: OpenQuote): Promise<ProtocolError | null>
  approveUsdg(amount: bigint): Promise<void>
  openPosition(quote: OpenQuote): Promise<Position>
  closePosition(id: string): Promise<SettlementReceipt>
  /** Refused with SlippageExceeded when the pool moved past the quote's minimum. */
  executeSwap(quote: SwapQuote): Promise<Trade>
  hlpDeposit(amount: bigint): Promise<void>
  hlpWithdraw(amount: bigint): Promise<void>
  requestListing(address: Address): Promise<void>

  // ── live ────────────────────────────────────────────────────────────────
  /** Knock-outs, settlements, barrier approaches, status changes (§7.6). */
  subscribe(listener: (event: ProtocolEvent) => void): () => void
  /** Anything a screen shows may have moved. Cheap to call often. */
  onChange(listener: () => void): () => void
}

export type Mode = 'paper' | 'testnet' | 'mainnet'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Custom errors the contracts revert with, named as they will be in the ABI.
 * The UI never shows one of these names — each has a sentence in the i18n
 * dictionary under `errors.<code>`.
 */
export type ProtocolErrorCode =
  | 'QuoteExpired'
  | 'CapacityExceeded'
  | 'TokenNotEligible'
  | 'OracleStale'
  | 'InsufficientBalance'
  | 'InsufficientAllowance'
  | 'InsufficientTokenBalance'
  | 'SlippageExceeded'
  | 'CollateralTooSmall'
  | 'PayoutNotEligible'
  | 'Paused'
  | 'Restricted'
  | 'WithdrawExceedsUnreserved'
  | 'LockupActive'
  | 'WalletNotConnected'
  | 'IndexerUnavailable'
  | 'Unknown'

export class ProtocolError extends Error {
  constructor(
    readonly code: ProtocolErrorCode,
    readonly detail?: Record<string, string | number>,
  ) {
    super(code)
    this.name = 'ProtocolError'
  }
}

/** Anything thrown by an adapter, turned into a ProtocolError. */
export function decodeError(err: unknown): ProtocolError {
  if (err instanceof ProtocolError) return err
  const message = err instanceof Error ? err.message : String(err)
  // Contract reverts arrive as "execution reverted: CapacityExceeded()" or as a
  // decoded error name; pull the name out if there is one.
  const match = /([A-Z][A-Za-z]+)\(\)/.exec(message)
  if (match) {
    const code = match[1] as ProtocolErrorCode
    return new ProtocolError(code)
  }
  return new ProtocolError('Unknown', { message })
}

/** Errors that mean "get a fresh quote and try again" rather than "stop". */
export const REQUOTE_ON: ProtocolErrorCode[] = ['QuoteExpired', 'CapacityExceeded', 'SlippageExceeded']
