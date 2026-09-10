/**
 * Tokens that exist on the chain but not in our lists.
 *
 * Robinhood Chain has millions of contracts and SHORTCOIN ships a few hundred
 * names. When somebody pastes an address, the identity comes back off the chain
 * for real — symbol, name, decimals, supply — and everything a simulation needs
 * on top of that (price, depth, borrow) is invented here, deterministically
 * from the address so the same contract always looks the same.
 *
 * The split matters and the UI states it plainly: what the chain said is real,
 * what the market looks like is not.
 */

import { between, rng } from './rng'
import type { Asset } from './types'
import type { OnChainToken } from './chain'

export interface ImportedTokenPayload {
  address: string
  symbol: string
  name: string
  decimals: number
  supply: number
}

/**
 * Turn a chain read into something the terminal can quote.
 *
 * Nothing here pretends to be a real price. A token nobody has indexed has no
 * observable market, so the numbers are seeded from the address and the supply
 * — enough to populate a chart, never enough to trade on.
 */
export function assetFromChain(token: ImportedTokenPayload): Asset {
  const next = rng(`chain:${token.address}`)

  // Anchor a plausible valuation to the supply, so a billion-supply token
  // prices in fractions of a cent and a scarce one does not.
  const marketCap = between(next, 4_000, 900_000)
  const price = token.supply > 0 ? marketCap / token.supply : between(next, 1e-7, 1)
  const liquidity = marketCap * between(next, 0.02, 0.22)

  return {
    symbol: token.symbol,
    name: token.name,
    tokenName: token.name,
    sector: 'Unindexed',
    assetClass: 'coin',
    quote: 'USDG',
    ageHours: between(next, 6, 2400),
    launchpad: undefined,
    graduationPct: undefined,
    private: false,
    address: token.address,
    // This one is genuinely true: the address was read off the chain.
    verifiedAddress: true,
    logoHue: Math.floor(next() * 360),
    price,
    anchor: price,
    change1h: (Math.exp(between(next, -0.5, 0.5)) - 1) * 100,
    change24h: (Math.exp(between(next, -0.9, 0.9)) - 1) * 100,
    change7d: (Math.exp(between(next, -1.4, 1.6)) - 1) * 100,
    volume24h: liquidity * between(next, 0.3, 9),
    liquidity,
    marketCap,
    holders: Math.max(Math.floor(between(next, 4, 900)), 2),
    // An unindexed token is the hardest thing on the chain to be short of.
    borrowFee: between(next, 1.2, 8),
    fundingRate: between(next, -0.005, 0.005),
    shortInterest: between(next, 0, 0.03),
    openInterest: liquidity * between(next, 0.02, 0.3),
    phase: 'open',
    vol: between(next, 1.8, 6),
    drift: between(next, -1, 0.5),
    shortRoute: 'none',
    collateralOnly: false,
    wholeSharesOnly: false,
    uiMultiplier: 1,
    /** Set so the UI can say where this came from. */
    imported: true,
  }
}

/** Narrow an OnChainToken to the serialisable payload the client receives. */
export function toPayload(token: OnChainToken): ImportedTokenPayload {
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    supply: token.supply,
  }
}
