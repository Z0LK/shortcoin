/**
 * SHORTCOIN — synthetic inversion engine.
 *
 * The product wedge: on-chain token venues only let you go long. We build a
 * synthetic INVERSE instrument from the underlying price series, so that buying
 * the inverse is economically a short of the underlying.
 *
 * Three transforms are supported. All of them are strictly decreasing in P, so
 * the bar's HIGH and LOW always SWAP: the worst moment of a short is the moment
 * the underlying printed its high.
 *
 *   reciprocal  S = A² / P
 *     Convex. Never reaches zero, never negative, upside unbounded, loss capped
 *     at the full stake. SHORTCOIN's default.
 *
 *     The property that makes it the right choice: on a LOGARITHMIC price axis
 *     it is an exact reflection at every horizon, because
 *         ln S = 2·ln A − ln P    ⟹    ln(S₁/S₀) = −ln(P₁/P₀)
 *     There is no approximation and no path dependence. This is why the chart
 *     defaults to a log scale — the flip is then a true mirror, not a lookalike.
 *
 *   mirror      S = 2A − P
 *     Linear. Absolute PnL matches a classic short of the same quantity exactly,
 *     one-to-one. Its flaw: it goes negative once P > 2A, so it must be
 *     re-anchored (or clamped) on assets that more than double.
 *
 *   compound    Sₜ = Sₜ₋₁ · (1 − rₜ),  rₜ = Pₜ/Pₜ₋₁ − 1
 *     Path dependent. This is what a −1x daily-rebalanced inverse ETF (SQQQ and
 *     friends) actually does, volatility decay included. Honest, but it drifts
 *     away from the naive expectation, so we surface the decay in the UI rather
 *     than hiding it.
 */

import type { Candle, InversionMode, Side } from './types'

/** Floor applied to reciprocal/mirror output so a chart never plots ≤ 0. */
const EPS = 1e-9

export const INVERSION_LABELS: Record<InversionMode, string> = {
  reciprocal: 'Reciprocal',
  mirror: 'Linear mirror',
  compound: 'Compounded −1x',
}

export const INVERSION_BLURBS: Record<InversionMode, string> = {
  reciprocal:
    'S = A²/P. Convex payoff, price can never go negative, upside uncapped, downside capped at your stake. Matches an inverse perp.',
  mirror:
    'S = 2A − P. Absolute PnL tracks a classic short one-to-one. Re-anchors if the underlying more than doubles.',
  compound:
    'Sₜ = Sₜ₋₁·(1 − rₜ). Reproduces a −1x daily-rebalanced inverse ETF, volatility decay included.',
}

/** Invert a single price. `anchor` is the reference level the mirror pivots on. */
export function invertPrice(price: number, anchor: number, mode: InversionMode = 'reciprocal'): number {
  if (mode === 'mirror') return Math.max(2 * anchor - price, EPS)
  // `compound` has no closed form for a single point; the anchored reciprocal is
  // its correct instantaneous equivalent, so it is used for scalar conversions.
  return Math.max((anchor * anchor) / Math.max(price, EPS), EPS)
}

/** Map an inverted price back to the underlying. Exact inverse of `invertPrice`. */
export function revertPrice(inverted: number, anchor: number, mode: InversionMode = 'reciprocal'): number {
  if (mode === 'mirror') return Math.max(2 * anchor - inverted, EPS)
  return Math.max((anchor * anchor) / Math.max(inverted, EPS), EPS)
}

/**
 * Invert one OHLC bar. Because every transform is decreasing, high and low swap:
 *   S.high = f(P.low)   S.low = f(P.high)
 * Volume is an exchanged quantity, not a price, so it is carried through as-is.
 */
export function invertCandle(c: Candle, anchor: number, mode: InversionMode = 'reciprocal'): Candle {
  return {
    time: c.time,
    open: invertPrice(c.open, anchor, mode),
    high: invertPrice(c.low, anchor, mode),
    low: invertPrice(c.high, anchor, mode),
    close: invertPrice(c.close, anchor, mode),
    volume: c.volume,
  }
}

/**
 * Invert a whole series.
 *
 * `anchor` defaults to the first bar's open, which makes the inverse instrument
 * start at exactly the same price as the underlying — so the two charts share an
 * origin and the flip reads as a reflection rather than a rescale.
 */
export function invertSeries(
  candles: Candle[],
  mode: InversionMode = 'reciprocal',
  anchor?: number,
): Candle[] {
  if (candles.length === 0) return []
  const a = anchor ?? candles[0].open

  if (mode !== 'compound') return candles.map((c) => invertCandle(c, a, mode))

  // Compounded −1x: walk the series, applying the negated return of each bar to
  // the running inverse level. Intrabar extremes are derived from the same bar's
  // extremes relative to the previous close, with high/low swapped.
  const out: Candle[] = []
  let level = a
  let prevClose = candles[0].open

  for (const c of candles) {
    const open = level
    const rHigh = c.high / prevClose - 1
    const rLow = c.low / prevClose - 1
    const rClose = c.close / prevClose - 1
    const close = Math.max(level * (1 - rClose), EPS)
    out.push({
      time: c.time,
      open,
      // negated returns: the underlying's low is the inverse's high
      high: Math.max(level * (1 - rLow), EPS),
      low: Math.max(level * (1 - rHigh), EPS),
      close,
      volume: c.volume,
    })
    level = close
    prevClose = c.close
  }
  return out
}

/**
 * Percentage change of the inverse instrument implied by a move in the
 * underlying, for the reciprocal transform: P₀/P₁ − 1.
 */
export function inverseReturn(from: number, to: number): number {
  return from / Math.max(to, EPS) - 1
}

// ---------------------------------------------------------------------------
// Position maths — always computed on UNDERLYING prices, never inverted ones.
// The inversion is a lens for the chart and the ticket; the book stays honest.
// ---------------------------------------------------------------------------

/** Notional exposure in USD. */
export function notional(size: number, price: number): number {
  return size * price
}

/**
 * Unrealised PnL in USD.
 *   long  → size · (mark − entry)
 *   short → size · (entry − mark)
 */
export function unrealizedPnl(side: Side, entry: number, mark: number, size: number): number {
  const delta = side === 'short' ? entry - mark : mark - entry
  return delta * size
}

/** Return on equity, i.e. PnL as a fraction of posted margin. */
export function roe(side: Side, entry: number, mark: number, size: number, margin: number): number {
  if (margin <= 0) return 0
  return unrealizedPnl(side, entry, mark, size) / margin
}

/**
 * Liquidation price.
 *
 * A position is liquidated when its loss eats the margin down to the
 * maintenance requirement:
 *   short → P = entry · (1 + 1/L − mm)
 *   long  → P = entry · (1 − 1/L + mm)
 *
 * `mm` is the maintenance margin ratio (0.005 = 0.5%).
 */
export function liquidationPrice(side: Side, entry: number, leverage: number, mm = 0.005): number {
  const l = Math.max(leverage, 1)
  return side === 'short' ? entry * (1 + 1 / l - mm) : Math.max(entry * (1 - 1 / l + mm), EPS)
}

/** How close a position sits to liquidation, 0 (safe) → 1 (liquidated). */
export function liquidationProximity(side: Side, entry: number, mark: number, liq: number): number {
  const span = Math.abs(liq - entry)
  if (span <= 0) return 0
  const travelled = side === 'short' ? mark - entry : entry - mark
  return Math.min(Math.max(travelled / span, 0), 1)
}

/**
 * Funding payment over `hours`. Rates are quoted per 8h.
 * A positive rate means longs pay shorts, so a short RECEIVES it.
 */
export function fundingOver(side: Side, rate8h: number, notionalUsd: number, hours: number): number {
  const periods = hours / 8
  const paid = rate8h * notionalUsd * periods
  return side === 'short' ? paid : -paid
}

/** Borrow fee charged to a short, quoted annualised. Longs pay nothing. */
export function borrowOver(side: Side, annualRate: number, notionalUsd: number, hours: number): number {
  if (side !== 'short') return 0
  return -annualRate * notionalUsd * (hours / 8760)
}

/**
 * Volatility decay of the compounded −1x instrument versus the naive
 * "negative of the underlying's return" a user intuitively expects.
 * Returns a negative number when decay has cost the holder money.
 */
export function compoundDecay(candles: Candle[], anchor?: number): number {
  if (candles.length < 2) return 0
  const a = anchor ?? candles[0].open
  const compounded = invertSeries(candles, 'compound', a)
  const actual = compounded[compounded.length - 1].close / a - 1
  const naive = -(candles[candles.length - 1].close / candles[0].open - 1)
  return actual - naive
}

// ---------------------------------------------------------------------------
// Leverage, carry and the honest price of a synthetic short.
// ---------------------------------------------------------------------------

/**
 * Leveraged inverse: S = A^(1+λ) / P^λ, so that dlnS/dlnP = −λ.
 * λ = 1 collapses to the plain reciprocal. This is how SHORTCOIN offers 2x and
 * 3x short instruments without leaving the "buy a token" mental model.
 */
export function invertPriceLeveraged(price: number, anchor: number, lambda = 1): number {
  return Math.max(Math.pow(anchor, 1 + lambda) / Math.pow(Math.max(price, EPS), lambda), EPS)
}

/**
 * Closed-form drag exponent of a continuously rebalanced Lx product:
 *   −½·L·(L−1)·σ²·T
 * For L = −1 this is −σ²T; for −2, −3σ²T; for −3, −6σ²T. Rebalanced inverse
 * exposure is strictly more expensive to hold than the naive intuition, and the
 * product says so rather than hiding it.
 */
export function volatilityDrag(leverage: number, sigma: number, years: number): number {
  return -0.5 * leverage * (leverage - 1) * sigma * sigma * years
}

/**
 * The reciprocal quoted raw hands the holder a free long-variance position worth
 * about σ² per year — roughly 16%/yr on a 40%-vol name. A venue that does not
 * charge for it is giving away gamma, so SHORTCOIN prices carry explicitly:
 *
 *   S_fair(t) = (A²/P) · exp(−(σ² + borrow + fee)·t)
 *
 * `years` is the holding period. Returns the carry-adjusted inverse price.
 */
export function fairInversePrice(
  price: number,
  anchor: number,
  sigma: number,
  years: number,
  borrowRate = 0,
  protocolFee = 0,
): number {
  const raw = invertPrice(price, anchor, 'reciprocal')
  return raw * Math.exp(-(sigma * sigma + borrowRate + protocolFee) * years)
}

/** Annualised cost of carry embedded in a reciprocal quote, as a fraction. */
export function carryRate(sigma: number, borrowRate = 0, protocolFee = 0): number {
  return sigma * sigma + borrowRate + protocolFee
}

/**
 * Where the liquidation level sits once the chart is inverted.
 *
 * A short is liquidated when the underlying rises, and rising underlying means
 * a FALLING inverse — so in inverted space the liquidation line is a floor
 * drawn below the current price, never a ceiling. Getting this backwards is the
 * single most dangerous thing an inverted chart can do.
 */
export function invertedLiquidation(
  liqUnderlying: number,
  anchor: number,
  mode: InversionMode = 'reciprocal',
): number {
  return invertPrice(liqUnderlying, anchor, mode)
}

/**
 * Two-sided quotes invert too, and the sides swap for the same monotonicity
 * reason the high and the low do: the best price to sell the inverse comes from
 * the best price to buy the underlying.
 */
export function invertQuote(
  bid: number,
  ask: number,
  anchor: number,
  mode: InversionMode = 'reciprocal',
): { bid: number; ask: number } {
  return {
    bid: invertPrice(ask, anchor, mode),
    ask: invertPrice(bid, anchor, mode),
  }
}
