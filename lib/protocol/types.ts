/**
 * Data contracts between the front end and the protocol.
 *
 * Copied from SPEC-FRONTEND.md §6 and kept byte-for-byte compatible with it:
 * every adapter — paper, testnet, mainnet — speaks exactly these shapes, which
 * is what lets the paper mode stay an implementation of the interface rather
 * than a parallel code path.
 *
 * Two deliberate additions, both requested elsewhere in the spec:
 *   - `TokenRow.concentration` (§7.3: plan the field now even though the
 *     clustering pipeline does not exist yet)
 *   - `SearchResult` (§3: a search always resolves to a state, never to nothing)
 *
 * Money is `bigint` end to end. Prices are fixed-point strings scaled by 1e18.
 * Nothing in here is ever a JavaScript `number` that represents an amount.
 */

export type Address = `0x${string}`

export type TokenStatus =
  | 'ELIGIBLE'
  | 'WARMUP' // historique TWAP insuffisant (jour 1)
  | 'CAPACITY_FULL' // notionnel ouvert au plafond k × profondeur
  | 'TREASURY_EXHAUSTED'
  | 'REDUCE_ONLY' // plus d'ouverture, positions existantes courent
  | 'INELIGIBLE_CONCENTRATION' // un cluster de wallets dépasse le seuil
  | 'INELIGIBLE_DEPTH'
  | 'ORACLE_STALE'
  | 'PAUSED'
  | 'UNTRACKED' // adresse valide, aucun pool suivi

export interface TokenStatusInfo {
  status: TokenStatus
  canOpen: boolean
  canClose: boolean
  reason: string // phrase utilisateur, pas un code
  recheckAt?: number // unix ms, pour WARMUP et ORACLE_STALE
}

/**
 * Wallet-cluster concentration. Comes from an off-chain analysis pipeline, not
 * the contract, and that pipeline does not exist yet — hence `source`.
 */
export interface Concentration {
  /** Share of supply held by the largest cluster of linked wallets, 0..1. */
  topClusterPct: number
  /** Threshold above which the token is INELIGIBLE_CONCENTRATION, 0..1. */
  thresholdPct: number
  source: 'pipeline' | 'mock' | 'unavailable'
}

export interface TokenRow {
  address: Address
  symbol: string
  name: string
  decimals: number
  status: TokenStatusInfo
  quoteDepth: bigint // profondeur côté USDG
  utilization: number // 0..1
  remainingNotional: bigint
  dailyRateBps: number
  spotPrice: string // fixed point 1e18
  twap24h: string
  twap72h: string
  lastSampleAt: number
  concentration: Concentration
}

export interface OpenQuote {
  quoteId: string
  expiresAt: number
  token: Address
  collateral: bigint
  notional: bigint
  entryPrice: string
  entryPriceSource: 'SPOT' | 'TWAP'
  capPct: number // 0.5 aujourd'hui — ne pas coder en dur
  barrierPct: number // 1.5 aujourd'hui
  capPrice: string
  barrierPrice: string
  maxPayout: bigint
  dailyRateBps: number
  marginalRateBps: number
  utilizationBefore: number
  utilizationAfter: number
  backing: { treasuryBps: number; hlpBps: number }
  payoutEligibleAt: number
  minSettlementWindowHours: number
}

export type PositionStatus = 'OPEN' | 'KNOCKED_OUT' | 'PENDING_SETTLEMENT' | 'SETTLED' | 'CLOSED'

export interface Position {
  id: string
  token: Address
  status: PositionStatus
  openedAt: number
  collateral: bigint
  notional: bigint
  entryPrice: string
  capPrice: string
  barrierPrice: string
  accruedPremium: bigint
  settlementMark: string // max(twap24h, twap72h) → régit le payout
  knockoutMark: string // min(twap24h, twap72h) → régit le knock-out
  spotPrice: string // affichage secondaire uniquement
  currentValue: bigint // V(P) sur settlementMark
  equity: bigint // currentValue − accruedPremium
  pnl: bigint
  distanceToBarrierPct: number
  premiumRunwayDays: number
  payoutEligibleAt: number
  windowExtendedUntil: number | null
  windowExtensionReason?: string
}

export interface PriceSample {
  at: number
  price: string
}

export interface SettlementReceipt {
  positionId: string
  trigger: 'KNOCKOUT' | 'CAP_REACHED' | 'USER_CLOSE' | 'EXPIRY'
  triggeredBy: 'TWAP24' | 'TWAP72'
  triggerPrice: string
  samples: PriceSample[]
  txHash: Address
  keeper: Address
  collateral: bigint
  premiumPaid: bigint
  payout: bigint
}

export interface HlpState {
  nav: bigint
  sharePrice: string
  totalShares: bigint
  reserved: bigint
  utilization: number
  utilizationCap: number
  lockupSeconds: number
  perTokenExposure: { token: Address; reserved: bigint; capBps: number }[]
}

// ---------------------------------------------------------------------------
// Additions the spec asks for without spelling out the shape.
// ---------------------------------------------------------------------------

/**
 * What a search resolves to. §3: an address never resolves to "nothing" —
 * it resolves to a token, to "no tracked pool", or to a format error, and
 * those are three different things for the user.
 */
export type SearchResult =
  | { kind: 'token'; token: TokenRow; homonym: boolean }
  | { kind: 'untracked'; address: Address; symbol?: string; name?: string }
  | { kind: 'invalid-address'; input: string }

/** The connected account's own HLP position, alongside the pool-wide state. */
export interface HlpAccount {
  shares: bigint
  value: bigint
  /** Part of `value` that is not backing an open position and can leave. */
  withdrawable: bigint
  /** Unix ms. Nothing can be withdrawn before this. */
  lockedUntil: number | null
  /** Loss if every reservation the pool backs paid out at its cap at once. */
  maxDrawdown: bigint
  realizedApr: number
}

export interface Account {
  address: Address
  usdgBalance: bigint
  /** USDG the protocol is allowed to pull. §7.5 — approvals are a real step. */
  usdgAllowance: bigint
}

/** Events the UI turns into toasts and alerts. §7.6. */
export type ProtocolEvent =
  | { type: 'position.knockout'; position: Position; receiptId: string }
  | { type: 'position.settled'; position: Position; receiptId: string }
  | { type: 'position.barrier-approach'; position: Position; distancePct: number }
  | { type: 'position.payout-eligible'; position: Position }
  | { type: 'token.status'; token: TokenRow }
  | { type: 'token.launched'; token: TokenRow }

export interface ListingRequest {
  address: Address
  requestedAt: number
}
