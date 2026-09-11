/**
 * Payoff of a short position — for drawing, never for deciding.
 *
 * SPEC §4A: the front never computes the entry price, the premium or the
 * capacity; it shows what the quoter returns. These formulas exist for two
 * things only — the payoff graph, and a dev-time cross-check against the quote.
 *
 * The spec writes the value as
 *     V(P) = clamp( N × (1.5·P₀ − P) / P₀ , 0 , N )
 * which is the first tranche (cap at −50%, barrier at +50%). Written in terms
 * of the barrier price B and the cap price K it becomes
 *     V(P) = clamp( N × (B − P) / (B − K) , 0 , N )
 * — identical for today's tranche, and correct for any `capPct` / `barrierPct`
 * the quoter hands back later, which the spec requires.
 */

/**
 * The first tranche, as documented. The quoter is authoritative for every
 * position — this constant only exists so explanatory copy and the paper
 * mode's defaults describe the same product. Screens that show a real quote
 * must read `capPct` / `barrierPct` from the quote, never from here.
 */
export const FIRST_TRANCHE = { capPct: 0.5, barrierPct: 1.5 } as const

export interface PayoffParams {
  collateral: number
  notional: number
  entry: number
  cap: number
  barrier: number
}

export function positionValue(p: PayoffParams, price: number): number {
  const span = p.barrier - p.cap
  if (span <= 0) return 0
  const v = (p.notional * (p.barrier - price)) / span
  return Math.min(Math.max(v, 0), p.notional)
}

/** PnL after a given amount of premium has been drawn from the collateral. */
export function positionPnl(p: PayoffParams, price: number, premium = 0): number {
  return positionValue(p, price) - p.collateral - premium
}

/**
 * Price at which the position breaks even once `premium` has been paid.
 * SPEC: prix_breakeven = P₀ × (1.5 − (C + premium) / N). It drifts down every
 * day the position stays open, which is the thing the UI has to make visible.
 */
export function breakevenPrice(p: PayoffParams, premium = 0): number {
  return p.barrier - ((p.collateral + premium) * (p.barrier - p.cap)) / p.notional
}

/** SPEC: prix_équité_nulle = P₀ × (1.5 − premium / N). The effective barrier. */
export function zeroEquityPrice(p: PayoffParams, premium = 0): number {
  return p.barrier - (premium * (p.barrier - p.cap)) / p.notional
}

/**
 * Dev-only consistency check between what the quoter said and what the
 * formulas predict. A warning, not an error: the quoter is authoritative, and
 * a divergence means one of the two is wrong and somebody should look.
 */
export function crossCheckQuote(
  label: string,
  p: PayoffParams & { capPct: number; barrierPct: number; maxPayout: number },
  tolerance = 0.005,
) {
  if (process.env.NODE_ENV === 'production') return
  const checks: [string, number, number][] = [
    ['capPrice', p.cap, p.entry * p.capPct],
    ['barrierPrice', p.barrier, p.entry * p.barrierPct],
    ['maxPayout', p.maxPayout, p.notional - p.collateral],
    ['V(P₀) = C', positionValue(p, p.entry), p.collateral],
  ]
  for (const [name, got, expected] of checks) {
    if (expected === 0) continue
    const drift = Math.abs(got / expected - 1)
    if (drift > tolerance) {
      console.warn(
        `[payoff] ${label}: ${name} diverges from the formula by ${(drift * 100).toFixed(2)}% ` +
          `(quoter ${got}, formula ${expected}). The quoter wins; check which side is wrong.`,
      )
    }
  }
}
