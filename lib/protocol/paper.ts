/**
 * Paper mode.
 *
 * A complete implementation of ProtocolAdapter that runs in the browser. It is
 * not canned data: it prices every quote off a utilisation curve, reserves
 * capacity against a per-token treasury and then the HLP, accrues premium on
 * a floating rate, marks positions on the max/min of two time-weighted
 * averages, knocks them out, settles them, and writes receipts with the samples
 * that did it. SPEC §7.1 and §7.4 ask for exactly that — the mock has to react
 * to the amount typed so the rate curve can be seen and calibrated before
 * anything is deployed.
 *
 * Everything calibratable is in PAPER_CONFIG. The values are first guesses,
 * chosen to make every status and every screen reachable, and are expected to
 * change once the curve is calibrated against real demand.
 */

import type { MarketEngine } from '@/lib/sim'
import type { Asset } from '@/lib/types'
import { LISTED_UNIVERSE, coinPage, resolveAsset } from '@/lib/universe'
import { searchAssets } from '@/lib/search'
import { between, rng } from '@/lib/rng'
import {
  ProtocolError,
  type HistoryInterval,
  type Mode,
  type PriceHistory,
  type ProtocolAdapter,
  type TokenQuery,
} from './adapter'
import type {
  Account,
  Address,
  HlpAccount,
  HlpState,
  OpenQuote,
  Position,
  PositionStatus,
  PriceSample,
  ProtocolEvent,
  SearchResult,
  SettlementReceipt,
  TokenRow,
  TokenStatus,
} from './types'
import { E18, USDG_UNIT, fixed, fixedToNumber, ratioToFixed, toFixed18 } from './fixed'
import { resolveStatus, STATUS_RULES } from './status'
import { TokenSeries, WINDOW_24H, WINDOW_72H } from './series'
import { FIRST_TRANCHE } from './payoff'

export const PAPER_CONFIG = {
  /** First tranche. Components read it from the quote, never from here. */
  capPct: FIRST_TRANCHE.capPct,
  barrierPct: FIRST_TRANCHE.barrierPct,
  /** Open notional may not exceed k × USDG depth of the pool. */
  capacityK: 0.25,
  minDepthUsd: 25_000,
  clusterThreshold: 0.35,
  staleAfterMs: 15 * 60_000,
  warmupHours: 24,
  quoteTtlMs: 20_000,
  payoutDelayMs: 6 * 3_600_000,
  minSettlementWindowHours: 24,
  minCollateral: 10n * USDG_UNIT,
  /** Aave-style utilisation curve applied to each token's base rate. */
  kink: 0.8,
  slope1: 1.2,
  slope2: 7,
  /** Alert when the knock-out mark is this close to the barrier. */
  barrierAlertPct: 0.1,
  /** Chance an open fails because someone else took the capacity first. */
  capacityRaceChance: 0.12,
  cappedSettlementDelayMs: 25_000,
  openingBalance: 25_000n * USDG_UNIT,
  hlpNav: 4_200_000n * USDG_UNIT,
  hlpUtilizationCap: 0.8,
  hlpLockupSeconds: 7 * 86_400,
  hlpTokenCapBps: 400,
  hlpRealizedApr: 0.184,
  hlpEpoch: Date.parse('2026-07-01T00:00:00Z'),
  keeper: '0x6b1f3a9e02c4d7a58e3f1c0b92d4e6a7f8c90d12' as Address,
  account: '0x7a3f9c21be04d5e8f6a1c9037bd82e4419f0cd6a' as Address,
  launchEveryMs: 3_800,
} as const

const STORAGE_KEY = 'shortcoin.paper.v2'
const TICK_MS = 2_000

// ---------------------------------------------------------------------------
// Per-token model
// ---------------------------------------------------------------------------

interface TokenModel {
  asset: Asset
  address: Address
  series: TokenSeries
  depth: bigint
  maxNotional: bigint
  /** Open notional from everyone who is not this account. Seeded. */
  othersNotional: bigint
  treasury: bigint
  baseRateBps: number
  paused: boolean
  reduceOnly: boolean
  topClusterPct: number
  launchedAt: number
  /** Oracle staleness cycles deterministically so ORACLE_STALE is reachable. */
  stale: { periodMs: number; staleMs: number; offsetMs: number } | null
}

function usd(n: number): bigint {
  return BigInt(Math.max(Math.round(n), 0)) * USDG_UNIT
}

/** Multiplier on the base rate at utilisation u. */
function curve(u: number): number {
  const { kink, slope1, slope2 } = PAPER_CONFIG
  const x = Math.min(Math.max(u, 0), 1.2)
  if (x <= kink) return 1 + (slope1 * x) / kink
  return 1 + slope1 + (slope2 * (x - kink)) / (1 - kink)
}

/** Average multiplier across [u0, u1] — the curve is piecewise linear. */
function averageCurve(u0: number, u1: number): number {
  if (u1 <= u0) return curve(u0)
  const steps = 24
  let sum = 0
  for (let i = 0; i < steps; i++) sum += curve(u0 + ((u1 - u0) * (i + 0.5)) / steps)
  return sum / steps
}

// ---------------------------------------------------------------------------
// Persisted state
// ---------------------------------------------------------------------------

interface PositionRecord {
  id: string
  token: Address
  symbol: string
  status: PositionStatus
  openedAt: number
  collateral: bigint
  notional: bigint
  entryPrice: string
  capPrice: string
  barrierPrice: string
  accruedPremium: bigint
  lastAccrualAt: number
  treasuryPart: bigint
  hlpPart: bigint
  payoutEligibleAt: number
  windowExtendedUntil: number | null
  windowExtensionReason?: string
  closedAt?: number
  cappedAt?: number
  alerted?: boolean
  eligibleNotified?: boolean
}

interface State {
  balance: bigint
  allowance: bigint
  positions: PositionRecord[]
  receipts: SettlementReceipt[]
  hlpShares: bigint
  hlpDepositedAt: number | null
  listingRequests: { address: Address; requestedAt: number }[]
  seq: number
}

const INITIAL: State = {
  balance: PAPER_CONFIG.openingBalance,
  allowance: 0n,
  positions: [],
  receipts: [],
  hlpShares: 0n,
  hlpDepositedAt: null,
  listingRequests: [],
  seq: 0,
}

function save(state: State) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state, (_k, v) => (typeof v === 'bigint' ? { $b: v.toString() } : v)),
    )
  } catch {
    // Private windows and full quotas: the session keeps working, it just
    // will not survive a reload.
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(INITIAL)
    return JSON.parse(raw, (_k, v) =>
      v && typeof v === 'object' && '$b' in v ? BigInt((v as { $b: string }).$b) : v,
    ) as State
  } catch {
    return structuredClone(INITIAL)
  }
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export class PaperAdapter implements ProtocolAdapter {
  readonly mode: Mode = 'paper'

  private state: State
  private models = new Map<string, TokenModel>()
  private byAddress = new Map<string, TokenModel>()
  private quotes = new Map<string, OpenQuote>()
  private eventListeners = new Set<(e: ProtocolEvent) => void>()
  private changeListeners = new Set<() => void>()
  private watched = new Map<string, number>()
  private launchIndex = -1
  private timers: ReturnType<typeof setInterval>[] = []

  constructor(private readonly engine: MarketEngine) {
    this.state = typeof window === 'undefined' ? structuredClone(INITIAL) : load()
    for (const a of LISTED_UNIVERSE) this.model(a)
    if (typeof window !== 'undefined') {
      this.timers.push(setInterval(() => this.tick(), TICK_MS))
      this.timers.push(setInterval(() => this.launch(), PAPER_CONFIG.launchEveryMs))
    }
  }

  // ── models ─────────────────────────────────────────────────────────────

  private model(asset: Asset): TokenModel {
    const hit = this.models.get(asset.symbol)
    if (hit) return hit

    const next = rng(`paper:${asset.address}`)
    const isCoin = asset.assetClass === 'coin'
    const depth = usd(asset.liquidity)
    const maxNotional = (depth * BigInt(Math.round(PAPER_CONFIG.capacityK * 1000))) / 1000n

    // Most tokens sit comfortably below the kink; a few are nearly full, and a
    // handful are exactly full, so every part of the curve is on screen.
    const roll = next()
    const baseUtil = roll > 0.96 ? 1 : roll > 0.85 ? between(next, 0.82, 0.98) : between(next, 0.05, 0.7)
    const othersNotional = BigInt(Math.floor(Number(maxNotional) * baseUtil))

    const treasuryRoll = next()
    const treasury =
      treasuryRoll > 0.97 ? 0n : BigInt(Math.floor(Number(maxNotional) * between(next, 0.05, 0.4)))

    const volScale = Math.min(asset.vol, 6)
    const baseRateBps = isCoin ? 12 + volScale * between(next, 6, 11) : 1.5 + volScale * between(next, 3, 7)

    const ageMs = asset.ageHours === undefined ? 400 * 86_400_000 : asset.ageHours * 3_600_000

    const staleRoll = next()
    const model: TokenModel = {
      asset,
      address: asset.address.toLowerCase() as Address,
      series: new TokenSeries(asset, asset.ageHours),
      depth,
      maxNotional,
      othersNotional,
      treasury,
      baseRateBps,
      paused: next() > 0.995,
      reduceOnly: next() > 0.985,
      topClusterPct: isCoin ? between(next, 0.04, 0.55) : between(next, 0.01, 0.12),
      launchedAt: Date.now() - ageMs,
      stale:
        staleRoll > 0.95
          ? { periodMs: 40 * 60_000, staleMs: 6 * 60_000, offsetMs: Math.floor(next() * 40 * 60_000) }
          : null,
    }
    this.models.set(asset.symbol, model)
    this.byAddress.set(model.address, model)
    return model
  }

  private find(addressOrSymbol: string): TokenModel | null {
    const key = addressOrSymbol.trim()
    const byAddr = this.byAddress.get(key.toLowerCase())
    if (byAddr) return byAddr
    const asset = resolveAsset(key)
    return asset ? this.model(asset) : null
  }

  private watch(m: TokenModel) {
    this.watched.set(m.address, Date.now())
    this.engine.ensure(m.asset)
  }

  private spot(m: TokenModel): number {
    return this.engine.snapshot(m.asset.symbol)?.price ?? m.series.spot(Date.now())
  }

  // ── derived figures ────────────────────────────────────────────────────

  private myNotional(m: TokenModel): bigint {
    return this.state.positions
      .filter((p) => p.token === m.address && p.status === 'OPEN')
      .reduce((s, p) => s + p.notional, 0n)
  }

  private openNotional(m: TokenModel): bigint {
    return m.othersNotional + this.myNotional(m)
  }

  private utilization(m: TokenModel, extra = 0n): number {
    if (m.maxNotional === 0n) return 1
    return Number(((this.openNotional(m) + extra) * 10_000n) / m.maxNotional) / 10_000
  }

  private treasuryAvailable(m: TokenModel): bigint {
    const used = this.state.positions
      .filter((p) => p.token === m.address && p.status === 'OPEN')
      .reduce((s, p) => s + p.treasuryPart, 0n)
    return m.treasury > used ? m.treasury - used : 0n
  }

  private rateBps(m: TokenModel, u = this.utilization(m)): number {
    return m.baseRateBps * curve(u)
  }

  private lastSampleAt(m: TokenModel, now: number): number {
    if (!m.stale) return now - 20_000
    const phase = (now + m.stale.offsetMs) % m.stale.periodMs
    // In the stale slice of the cycle, the last sample is as old as the slice
    // is deep plus the threshold, so the countdown to recovery is real.
    return phase < m.stale.staleMs ? now - PAPER_CONFIG.staleAfterMs - phase - 1 : now - 20_000
  }

  private status(m: TokenModel, now = Date.now()) {
    const lastSampleAt = this.lastSampleAt(m, now)
    const warmupEndsAt = m.launchedAt + PAPER_CONFIG.warmupHours * 3_600_000
    const status = resolveStatus({
      tracked: true,
      paused: m.paused,
      lastSampleAt,
      now,
      staleAfterMs: PAPER_CONFIG.staleAfterMs,
      warmupEndsAt,
      quoteDepthUsd: Number(m.depth / USDG_UNIT),
      minDepthUsd: PAPER_CONFIG.minDepthUsd,
      topClusterPct: m.topClusterPct,
      clusterThresholdPct: PAPER_CONFIG.clusterThreshold,
      reduceOnly: m.reduceOnly,
      treasuryExhausted: this.treasuryAvailable(m) === 0n,
      utilization: this.utilization(m),
    })

    let recheckAt: number | undefined
    if (status === 'WARMUP') recheckAt = warmupEndsAt
    if (status === 'ORACLE_STALE' && m.stale) {
      const phase = (now + m.stale.offsetMs) % m.stale.periodMs
      recheckAt = now + (m.stale.staleMs - phase)
    }

    const rules = STATUS_RULES[status]
    return {
      status,
      canOpen: rules.canOpen,
      canClose: rules.canClose,
      reason: PAPER_REASONS[status],
      recheckAt,
      lastSampleAt,
    }
  }

  private row(m: TokenModel, now = Date.now()): TokenRow {
    const s = this.status(m, now)
    const remaining = m.maxNotional > this.openNotional(m) ? m.maxNotional - this.openNotional(m) : 0n
    return {
      address: m.address,
      symbol: m.asset.symbol,
      name: m.asset.name,
      decimals: 18,
      status: {
        status: s.status,
        canOpen: s.canOpen,
        canClose: s.canClose,
        reason: s.reason,
        recheckAt: s.recheckAt,
      },
      quoteDepth: m.depth,
      utilization: Math.min(this.utilization(m), 1),
      remainingNotional: remaining,
      dailyRateBps: this.rateBps(m),
      spotPrice: toFixed18(this.spot(m)),
      twap24h: toFixed18(m.series.twap(WINDOW_24H, now)),
      twap72h: toFixed18(m.series.twap(WINDOW_72H, now)),
      lastSampleAt: s.lastSampleAt,
      concentration: {
        topClusterPct: m.topClusterPct,
        thresholdPct: PAPER_CONFIG.clusterThreshold,
        source: 'mock',
      },
    }
  }

  // ── reads ──────────────────────────────────────────────────────────────

  async account(): Promise<Account> {
    return {
      address: PAPER_CONFIG.account,
      usdgBalance: this.state.balance,
      usdgAllowance: this.state.allowance,
    }
  }

  async listTokens(query: TokenQuery = {}): Promise<TokenRow[]> {
    const now = Date.now()
    let models: TokenModel[]

    if (query.newest) {
      models = coinPage(query.newest.offset, query.newest.limit).map((a) => this.model(a))
    } else if (query.addresses) {
      models = query.addresses.map((a) => this.find(a)).filter((m): m is TokenModel => !!m)
    } else {
      models = LISTED_UNIVERSE.map((a) => this.model(a))
    }

    let rows = models.map((m) => this.row(m, now))
    if (query.openableOnly) rows = rows.filter((r) => r.status.canOpen)

    if (query.sort === 'capacity') {
      rows.sort((a, b) => (b.remainingNotional > a.remainingNotional ? 1 : -1))
    } else if (query.sort === 'rate') {
      rows.sort((a, b) => a.dailyRateBps - b.dailyRateBps)
    } else if (query.sort === 'depth') {
      rows.sort((a, b) => (b.quoteDepth > a.quoteDepth ? 1 : -1))
    }
    return rows
  }

  async getToken(addressOrSymbol: string): Promise<TokenRow | null> {
    const m = this.find(addressOrSymbol)
    if (!m) return null
    this.watch(m)
    return this.row(m)
  }

  async search(input: string): Promise<SearchResult[]> {
    const q = input.trim()
    if (!q) return []

    if (/^0x/i.test(q)) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(q)) {
        // A partial address is still worth matching against what we carry,
        // but a malformed one is a format problem, not a missing token.
        if (/^0x[0-9a-fA-F]{4,39}$/.test(q)) {
          const hits = searchAssets(LISTED_UNIVERSE, q, 8)
          if (hits.length) return hits.map((h) => this.tokenResult(h.asset))
        }
        return [{ kind: 'invalid-address', input: q }]
      }
      const m = this.byAddress.get(q.toLowerCase())
      if (m) return [this.tokenResult(m.asset)]

      // A valid address with no tracked pool. The chain may still know what it
      // is — the identity is looked up so the user sees which token they have,
      // alongside the fact that it cannot be opened.
      const identity = await lookupIdentity(q)
      return [{ kind: 'untracked', address: q.toLowerCase() as Address, ...identity }]
    }

    return searchAssets(LISTED_UNIVERSE, q, 14).map((h) => this.tokenResult(h.asset))
  }

  private tokenResult(asset: Asset): SearchResult {
    return {
      kind: 'token',
      token: this.row(this.model(asset)),
      homonym: isHomonym(asset),
    }
  }

  async history(token: Address, interval: HistoryInterval): Promise<PriceHistory> {
    const m = this.find(token)
    if (!m) return { candles: [], twap24h: [], twap72h: [] }
    this.watch(m)
    return m.series.history(interval, Date.now())
  }

  async listPositions(): Promise<Position[]> {
    return this.state.positions.map((p) => this.toPosition(p)).sort((a, b) => b.openedAt - a.openedAt)
  }

  async getPosition(id: string): Promise<Position | null> {
    const p = this.state.positions.find((x) => x.id === id)
    return p ? this.toPosition(p) : null
  }

  async positionSamples(id: string): Promise<PriceSample[]> {
    const p = this.state.positions.find((x) => x.id === id)
    const m = p && this.find(p.token)
    return m ? m.series.samples(WINDOW_72H, Date.now()) : []
  }

  async listReceipts(): Promise<SettlementReceipt[]> {
    return [...this.state.receipts].reverse()
  }

  async getReceipt(positionId: string): Promise<SettlementReceipt | null> {
    return this.state.receipts.find((r) => r.positionId === positionId) ?? null
  }

  async hlp(): Promise<{ pool: HlpState; account: HlpAccount }> {
    const now = Date.now()
    const years = (now - PAPER_CONFIG.hlpEpoch) / (365 * 86_400_000)
    const sharePrice = ratioToFixed(1 + PAPER_CONFIG.hlpRealizedApr * Math.max(years, 0))

    // Seeded reservations from everyone else, plus the HLP share of this
    // account's own open positions.
    const seededReserved = (PAPER_CONFIG.hlpNav * 46n) / 100n
    const myHlp = this.state.positions
      .filter((p) => p.status === 'OPEN')
      .reduce((s, p) => s + p.hlpPart, 0n)

    const userValue = (this.state.hlpShares * sharePrice) / E18
    const nav = PAPER_CONFIG.hlpNav + userValue
    const reserved = seededReserved + myHlp
    const utilization = Number((reserved * 10_000n) / nav) / 10_000

    const lockedUntil =
      this.state.hlpDepositedAt === null
        ? null
        : this.state.hlpDepositedAt + PAPER_CONFIG.hlpLockupSeconds * 1000
    const locked = lockedUntil !== null && now < lockedUntil

    const exposures = [...this.models.values()]
      .filter((m) => m.treasury > 0n)
      .slice(0, 400)
      .map((m) => {
        const r = rng(`hlp:${m.address}`)
        return {
          token: m.address,
          reserved: (nav * BigInt(Math.floor(between(r, 2, 380)))) / 10_000n,
          capBps: PAPER_CONFIG.hlpTokenCapBps,
        }
      })
      .sort((a, b) => (b.reserved > a.reserved ? 1 : -1))
      .slice(0, 12)

    const unreservedShare = nav > reserved ? ((nav - reserved) * 10_000n) / nav : 0n
    return {
      pool: {
        nav,
        sharePrice: sharePrice.toString(),
        totalShares: (nav * E18) / sharePrice,
        reserved,
        utilization,
        utilizationCap: PAPER_CONFIG.hlpUtilizationCap,
        lockupSeconds: PAPER_CONFIG.hlpLockupSeconds,
        perTokenExposure: exposures,
      },
      account: {
        shares: this.state.hlpShares,
        value: userValue,
        withdrawable: locked ? 0n : (userValue * unreservedShare) / 10_000n,
        lockedUntil,
        maxDrawdown: (userValue * reserved) / nav,
        realizedApr: PAPER_CONFIG.hlpRealizedApr,
      },
    }
  }

  // ── quoting ────────────────────────────────────────────────────────────

  async quoteOpen(token: Address, collateral: bigint): Promise<OpenQuote> {
    const m = this.find(token)
    if (!m) throw new ProtocolError('TokenNotEligible')
    this.watch(m)

    const now = Date.now()
    const s = this.status(m, now)
    if (!s.canOpen) {
      throw new ProtocolError(s.status === 'ORACLE_STALE' ? 'OracleStale' : 'TokenNotEligible', {
        status: s.status,
      })
    }
    if (collateral < PAPER_CONFIG.minCollateral) {
      throw new ProtocolError('CollateralTooSmall', { min: PAPER_CONFIG.minCollateral.toString() })
    }

    const notional = collateral * 2n
    const remaining = m.maxNotional - this.openNotional(m)
    if (notional > remaining) {
      throw new ProtocolError('CapacityExceeded', { maxCollateral: (remaining / 2n).toString() })
    }

    // P₀ = min(spot, TWAP). The TWAP is the settlement mark — max of the two —
    // so the entry can never sit above the price payouts will be judged on.
    const spot = this.spot(m)
    const settlementMark = Math.max(m.series.twap(WINDOW_24H, now), m.series.twap(WINDOW_72H, now))
    const entry = Math.min(spot, settlementMark)
    const entryPrice = BigInt(toFixed18(entry))

    const capPrice = (entryPrice * ratioToFixed(PAPER_CONFIG.capPct)) / E18
    const barrierPrice = (entryPrice * ratioToFixed(PAPER_CONFIG.barrierPct)) / E18

    const uBefore = this.utilization(m)
    const uAfter = this.utilization(m, notional)

    const treasuryAvail = this.treasuryAvailable(m)
    const treasuryPart = treasuryAvail >= collateral ? collateral : treasuryAvail
    const treasuryBps = collateral === 0n ? 0 : Number((treasuryPart * 10_000n) / collateral)

    const quote: OpenQuote = {
      quoteId: `q-${now.toString(36)}-${(this.state.seq++).toString(36)}`,
      expiresAt: now + PAPER_CONFIG.quoteTtlMs,
      token: m.address,
      collateral,
      notional,
      entryPrice: entryPrice.toString(),
      entryPriceSource: spot <= settlementMark ? 'SPOT' : 'TWAP',
      capPct: PAPER_CONFIG.capPct,
      barrierPct: PAPER_CONFIG.barrierPct,
      capPrice: capPrice.toString(),
      barrierPrice: barrierPrice.toString(),
      maxPayout: notional - collateral,
      dailyRateBps: m.baseRateBps * averageCurve(uBefore, uAfter),
      marginalRateBps: this.rateBps(m, uAfter),
      utilizationBefore: Math.min(uBefore, 1),
      utilizationAfter: Math.min(uAfter, 1),
      backing: { treasuryBps, hlpBps: 10_000 - treasuryBps },
      payoutEligibleAt: now + PAPER_CONFIG.payoutDelayMs,
      minSettlementWindowHours: PAPER_CONFIG.minSettlementWindowHours,
    }
    this.quotes.set(quote.quoteId, quote)
    return quote
  }

  // ── writes ─────────────────────────────────────────────────────────────

  async simulateOpen(quote: OpenQuote): Promise<ProtocolError | null> {
    if (Date.now() > quote.expiresAt) return new ProtocolError('QuoteExpired')
    if (quote.collateral > this.state.balance) return new ProtocolError('InsufficientBalance')
    if (quote.collateral > this.state.allowance) return new ProtocolError('InsufficientAllowance')
    const m = this.find(quote.token)
    if (!m) return new ProtocolError('TokenNotEligible')
    const s = this.status(m)
    if (!s.canOpen) return new ProtocolError(s.status === 'ORACLE_STALE' ? 'OracleStale' : 'TokenNotEligible')
    return null
  }

  async approveUsdg(amount: bigint): Promise<void> {
    await wait(700)
    this.state.allowance = amount
    this.commit()
  }

  async openPosition(quote: OpenQuote): Promise<Position> {
    await wait(900)
    const pre = await this.simulateOpen(quote)
    if (pre) throw pre

    const m = this.find(quote.token)!
    // Somebody else can take the last of the capacity between the quote and
    // the transaction. The UI's job is to requote, not to show a revert.
    if (rng(`race:${quote.quoteId}`)() < PAPER_CONFIG.capacityRaceChance) {
      m.othersNotional += quote.notional / 3n
      throw new ProtocolError('CapacityExceeded')
    }
    if (quote.notional > m.maxNotional - this.openNotional(m)) {
      throw new ProtocolError('CapacityExceeded')
    }

    const now = Date.now()
    const treasuryPart = (quote.collateral * BigInt(quote.backing.treasuryBps)) / 10_000n
    const record: PositionRecord = {
      id: `pos-${now.toString(36)}-${(this.state.seq++).toString(36)}`,
      token: m.address,
      symbol: m.asset.symbol,
      status: 'OPEN',
      openedAt: now,
      collateral: quote.collateral,
      notional: quote.notional,
      entryPrice: quote.entryPrice,
      capPrice: quote.capPrice,
      barrierPrice: quote.barrierPrice,
      accruedPremium: 0n,
      lastAccrualAt: now,
      treasuryPart,
      hlpPart: quote.collateral - treasuryPart,
      payoutEligibleAt: quote.payoutEligibleAt,
      windowExtendedUntil: null,
    }
    this.state.balance -= quote.collateral
    this.state.allowance -= quote.collateral
    this.state.positions.push(record)
    this.quotes.delete(quote.quoteId)
    this.watch(m)
    this.commit()
    return this.toPosition(record)
  }

  async closePosition(id: string): Promise<SettlementReceipt> {
    await wait(700)
    const p = this.state.positions.find((x) => x.id === id)
    if (!p || p.status !== 'OPEN') throw new ProtocolError('Unknown', { message: 'not open' })
    const m = this.find(p.token)
    if (m && !this.status(m).canClose) throw new ProtocolError('Paused')
    this.accrue(p, Date.now())
    const receipt = this.settle(p, 'USER_CLOSE', 'CLOSED')
    this.commit()
    return receipt
  }

  async hlpDeposit(amount: bigint): Promise<void> {
    await wait(700)
    if (amount > this.state.balance) throw new ProtocolError('InsufficientBalance')
    const { pool } = await this.hlp()
    const shares = (amount * E18) / fixed(pool.sharePrice)
    this.state.balance -= amount
    this.state.hlpShares += shares
    // Topping up restarts the lockup, which is the conservative reading and
    // the one that has to be shown to the depositor before they do it.
    this.state.hlpDepositedAt = Date.now()
    this.commit()
  }

  async hlpWithdraw(amount: bigint): Promise<void> {
    await wait(700)
    const { pool, account } = await this.hlp()
    if (account.lockedUntil && Date.now() < account.lockedUntil) throw new ProtocolError('LockupActive')
    if (amount > account.withdrawable) throw new ProtocolError('WithdrawExceedsUnreserved')
    const shares = (amount * E18) / fixed(pool.sharePrice)
    this.state.hlpShares -= shares > this.state.hlpShares ? this.state.hlpShares : shares
    this.state.balance += amount
    this.commit()
  }

  async requestListing(address: Address): Promise<void> {
    await wait(500)
    if (!this.state.listingRequests.some((r) => r.address === address)) {
      this.state.listingRequests.push({ address, requestedAt: Date.now() })
      this.commit()
    }
  }

  // ── live ───────────────────────────────────────────────────────────────

  subscribe(listener: (e: ProtocolEvent) => void) {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  onChange(listener: () => void) {
    this.changeListeners.add(listener)
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  private emit(e: ProtocolEvent) {
    this.eventListeners.forEach((l) => l(e))
  }

  private commit() {
    save(this.state)
    this.changeListeners.forEach((l) => l())
  }

  /** New launches off the tape, as the indexer would push them. */
  private launch() {
    if (typeof document !== 'undefined' && document.hidden) return
    const [asset] = coinPage(this.launchIndex--, 1)
    this.emit({ type: 'token.launched', token: this.row(this.model(asset)) })
  }

  /** Paper-mode test lever. See TokenSeries.shock. */
  shock(addressOrSymbol: string, factor: number) {
    const m = this.find(addressOrSymbol)
    if (!m) return
    m.series.shock(factor, Date.now())
    // Move the live spot with the history, or the next observation drags the
    // series straight back and the receipt ends on a sample that contradicts it.
    const live = this.engine.snapshot(m.asset.symbol)
    if (live) live.price *= factor
    this.tick()
  }

  // ── the keeper ─────────────────────────────────────────────────────────

  private accrue(p: PositionRecord, now: number) {
    const m = this.find(p.token)
    if (!m || now <= p.lastAccrualAt) return
    const days = (now - p.lastAccrualAt) / 86_400_000
    const bps = this.rateBps(m)
    const premium = BigInt(Math.floor(Number(p.collateral) * (bps / 10_000) * days))
    p.accruedPremium += premium
    if (p.accruedPremium > p.collateral) p.accruedPremium = p.collateral
    p.lastAccrualAt = now
  }

  private marks(m: TokenModel, now: number) {
    const t24 = m.series.twap(WINDOW_24H, now)
    const t72 = m.series.twap(WINDOW_72H, now)
    return {
      t24,
      t72,
      settlement: Math.max(t24, t72),
      knockout: Math.min(t24, t72),
      settlementBy: (t24 >= t72 ? 'TWAP24' : 'TWAP72') as 'TWAP24' | 'TWAP72',
      knockoutBy: (t24 <= t72 ? 'TWAP24' : 'TWAP72') as 'TWAP24' | 'TWAP72',
    }
  }

  /** V(P) in USDG base units, exact: N × (B − P) / (B − K), clamped. */
  private value(p: PositionRecord, markFixed: bigint): bigint {
    const B = fixed(p.barrierPrice)
    const K = fixed(p.capPrice)
    if (B <= K) return 0n
    if (markFixed >= B) return 0n
    if (markFixed <= K) return p.notional
    return (p.notional * (B - markFixed)) / (B - K)
  }

  private tick() {
    const now = Date.now()

    for (const [address, seen] of this.watched) {
      const m = this.byAddress.get(address)
      if (!m) continue
      if (now - seen > 120_000 && !this.state.positions.some((p) => p.token === address && p.status === 'OPEN')) {
        this.watched.delete(address)
        continue
      }
      m.series.observe(this.spot(m), now)
    }

    let changed = false
    for (const p of this.state.positions) {
      if (p.status === 'PENDING_SETTLEMENT') {
        if (p.cappedAt && now - p.cappedAt > PAPER_CONFIG.cappedSettlementDelayMs) {
          this.settle(p, 'CAP_REACHED', 'SETTLED')
          changed = true
        }
        continue
      }
      if (p.status !== 'OPEN') continue

      const m = this.find(p.token)
      if (!m) continue
      this.watch(m)
      this.accrue(p, now)

      const mk = this.marks(m, now)
      const barrier = fixedToNumber(p.barrierPrice)
      const cap = fixedToNumber(p.capPrice)

      // Knock-out runs on the LOWER of the two TWAPs — the reading most
      // favourable to the holder — so a spike has to persist to count.
      if (mk.knockout >= barrier) {
        this.settle(p, 'KNOCKOUT', 'KNOCKED_OUT')
        changed = true
        continue
      }

      // Premium has eaten the collateral: nothing left to draw against.
      if (p.accruedPremium >= p.collateral) {
        this.settle(p, 'EXPIRY', 'SETTLED')
        changed = true
        continue
      }

      // Payout runs on the HIGHER TWAP. Reaching the cap on it, once eligible,
      // settles the position at its maximum after the keeper's delay.
      if (mk.settlement <= cap && now >= p.payoutEligibleAt) {
        p.status = 'PENDING_SETTLEMENT'
        p.cappedAt = now
        changed = true
        continue
      }

      if (!p.eligibleNotified && now >= p.payoutEligibleAt) {
        p.eligibleNotified = true
        this.emit({ type: 'position.payout-eligible', position: this.toPosition(p) })
      }

      const distance = barrier / mk.knockout - 1
      if (distance < PAPER_CONFIG.barrierAlertPct && !p.alerted) {
        p.alerted = true
        this.emit({ type: 'position.barrier-approach', position: this.toPosition(p), distancePct: distance })
      } else if (distance >= PAPER_CONFIG.barrierAlertPct * 1.5) {
        p.alerted = false
      }

      // Heavy net selling against a thin pool stretches the settlement window.
      this.maybeExtendWindow(p, m, now)
    }

    if (changed) save(this.state)
    this.changeListeners.forEach((l) => l())
  }

  private maybeExtendWindow(p: PositionRecord, m: TokenModel, now: number) {
    if (p.windowExtendedUntil && now < p.windowExtendedUntil) return
    const slot = Math.floor(now / 3_600_000)
    const r = rng(`window:${p.id}:${slot}`)
    if (r() < 0.06) {
      const pct = between(r, 3, 11)
      p.windowExtendedUntil = now + 12 * 3_600_000
      p.windowExtensionReason = `Ventes nettes de ${pct.toFixed(1)} % de la profondeur du pool en une heure`
    } else if (p.windowExtendedUntil && now >= p.windowExtendedUntil) {
      p.windowExtendedUntil = null
      p.windowExtensionReason = undefined
    }
    void m
  }

  private settle(
    p: PositionRecord,
    trigger: SettlementReceipt['trigger'],
    status: PositionStatus,
  ): SettlementReceipt {
    const now = Date.now()
    const m = this.find(p.token)!
    const mk = this.marks(m, now)

    const triggeredBy = trigger === 'KNOCKOUT' ? mk.knockoutBy : mk.settlementBy
    const triggerPriceNum = triggeredBy === 'TWAP24' ? mk.t24 : mk.t72
    const settlementFixed = BigInt(toFixed18(mk.settlement))
    const value = trigger === 'KNOCKOUT' ? 0n : trigger === 'CAP_REACHED' ? p.notional : this.value(p, settlementFixed)

    // Before the payout delay has passed, a closing holder can recover
    // collateral but not collect a gain on it.
    const eligible = now >= p.payoutEligibleAt
    const gross = trigger === 'USER_CLOSE' && !eligible && value > p.collateral ? p.collateral : value
    const payout = gross > p.accruedPremium ? gross - p.accruedPremium : 0n

    p.status = status
    p.closedAt = now
    this.state.balance += payout

    const window = triggeredBy === 'TWAP24' ? WINDOW_24H : WINDOW_72H
    const r = rng(`tx:${p.id}:${trigger}`)
    const hex = () => Math.floor(r() * 16).toString(16)
    const receipt: SettlementReceipt = {
      positionId: p.id,
      trigger,
      triggeredBy,
      triggerPrice: toFixed18(triggerPriceNum),
      samples: m.series.samples(window, now),
      txHash: `0x${Array.from({ length: 64 }, hex).join('')}` as Address,
      keeper: trigger === 'USER_CLOSE' ? PAPER_CONFIG.account : PAPER_CONFIG.keeper,
      collateral: p.collateral,
      premiumPaid: p.accruedPremium,
      payout,
    }
    this.state.receipts.push(receipt)

    const position = this.toPosition(p)
    if (trigger === 'KNOCKOUT') {
      this.emit({ type: 'position.knockout', position, receiptId: p.id })
    } else {
      this.emit({ type: 'position.settled', position, receiptId: p.id })
    }
    return receipt
  }

  private toPosition(p: PositionRecord): Position {
    const now = Date.now()
    const m = this.find(p.token)
    const mk = m ? this.marks(m, now) : null
    const settlementFixed = mk ? BigInt(toFixed18(mk.settlement)) : fixed(p.entryPrice)
    const knockoutFixed = mk ? BigInt(toFixed18(mk.knockout)) : fixed(p.entryPrice)

    const open = p.status === 'OPEN' || p.status === 'PENDING_SETTLEMENT'
    const receipt = open ? null : this.state.receipts.find((r) => r.positionId === p.id)

    const currentValue = open
      ? p.status === 'PENDING_SETTLEMENT'
        ? p.notional
        : this.value(p, settlementFixed)
      : (receipt?.payout ?? 0n) + p.accruedPremium
    const equity = currentValue - p.accruedPremium
    const pnl = equity - p.collateral

    const barrier = fixedToNumber(p.barrierPrice)
    const knock = fixedToNumber(knockoutFixed)
    const dailyPremium = m ? Number(p.collateral) * (this.rateBps(m) / 10_000) : 0
    const buffer = Number(p.collateral - p.accruedPremium)

    return {
      id: p.id,
      token: p.token,
      status: p.status,
      openedAt: p.openedAt,
      collateral: p.collateral,
      notional: p.notional,
      entryPrice: p.entryPrice,
      capPrice: p.capPrice,
      barrierPrice: p.barrierPrice,
      accruedPremium: p.accruedPremium,
      settlementMark: settlementFixed.toString(),
      knockoutMark: knockoutFixed.toString(),
      spotPrice: m ? toFixed18(this.spot(m)) : p.entryPrice,
      currentValue,
      equity,
      pnl,
      distanceToBarrierPct: knock > 0 ? barrier / knock - 1 : 0,
      premiumRunwayDays: dailyPremium > 0 ? Math.max(buffer / dailyPremium, 0) : Infinity,
      payoutEligibleAt: p.payoutEligibleAt,
      windowExtendedUntil: p.windowExtendedUntil,
      windowExtensionReason: p.windowExtensionReason,
    }
  }

  /** Symbol of a position's token, for display. */
  symbolOf(address: string): string {
    return this.find(address)?.asset.symbol ?? address.slice(0, 8)
  }

  resetPaperAccount() {
    this.state = structuredClone(INITIAL)
    this.commit()
  }

  dispose() {
    this.timers.forEach(clearInterval)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Reasons in the contract's own words. The UI localises from the status. */
const PAPER_REASONS: Record<TokenStatus, string> = {
  ELIGIBLE: 'Ouvrable maintenant.',
  WARMUP: "Moins de 24 h d'historique TWAP : l'ouverture se débloque à la fin du rodage.",
  CAPACITY_FULL: 'Le notionnel ouvert a atteint la capacité du token.',
  TREASURY_EXHAUSTED: 'Le trésor du token est épuisé : plus aucune ouverture, les positions existantes courent.',
  REDUCE_ONLY: 'Token en reduce-only : plus aucune ouverture, les positions existantes courent.',
  INELIGIBLE_CONCENTRATION: 'Un groupe de wallets liés détient une part trop importante de la supply.',
  INELIGIBLE_DEPTH: 'Le pool est trop peu profond pour être marqué de façon fiable.',
  ORACLE_STALE: "L'oracle n'a pas été mis à jour récemment : l'ouverture reprend dès le prochain échantillon.",
  PAUSED: 'Le protocole est en pause sur ce token.',
  UNTRACKED: "Ce token n'a pas de pool suivi.",
}

/** Symbols and names that more than one listed token shares. */
const homonyms = (() => {
  const counts = new Map<string, number>()
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)
  for (const a of LISTED_UNIVERSE) {
    bump(`s:${a.symbol.toLowerCase()}`)
    bump(`n:${a.name.toLowerCase()}`)
  }
  return counts
})()

function isHomonym(asset: Asset): boolean {
  const base = asset.name.toLowerCase().replace(/[^a-z]/g, '')
  return (
    (homonyms.get(`s:${asset.symbol.toLowerCase()}`) ?? 0) > 1 ||
    (homonyms.get(`n:${asset.name.toLowerCase()}`) ?? 0) > 1 ||
    // Launchpad impersonation is mostly casing and punctuation games on a name
    // somebody else made famous.
    LISTED_UNIVERSE.some(
      (o) => o !== asset && o.name.toLowerCase().replace(/[^a-z]/g, '') === base && base.length > 2,
    )
  )
}

async function lookupIdentity(address: string): Promise<{ symbol?: string; name?: string }> {
  try {
    const res = await fetch(`/api/token?address=${address}`)
    if (!res.ok) return {}
    const json = (await res.json()) as { symbol?: string; name?: string }
    return { symbol: json.symbol, name: json.name }
  } catch {
    return {}
  }
}
