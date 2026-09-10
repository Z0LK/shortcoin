/**
 * Symbol search.
 *
 * The chain has 298 listings, a hundred of which are memecoins whose tickers
 * collide with each other and with real equities — there is a token literally
 * called TSLAMEME quoted against TSLA, and an APPLS whose name is "Apple Stock".
 * A plain `includes()` on that universe returns the wrong thing constantly, so
 * matches are ranked instead of filtered.
 *
 * Order of precedence, strongest first:
 *   1. exact ticker            NVDA → NVDA the stock token, never NVDAX
 *   2. exact contract address  pasting a 0x… address goes straight to it
 *   3. ticker prefix           PON → PONS
 *   4. name prefix             cash → Cash Cat
 *   5. ticker substring        ONS → PONS
 *   6. name substring          doge → Robinhood Doge
 *   7. address prefix          0x74 → the token deployed at 0x7410…
 *
 * Within a tier, liquidity breaks the tie: if two things match equally well,
 * the one you can actually trade wins.
 */

import type { Asset } from './types'

export interface SearchHit {
  asset: Asset
  /** Which rule matched, for the UI to explain itself. */
  reason: 'ticker' | 'address' | 'name'
  score: number
}

const TIER_EXACT_TICKER = 1000
const TIER_EXACT_ADDRESS = 900
const TIER_TICKER_PREFIX = 700
const TIER_NAME_PREFIX = 500
const TIER_TICKER_SUBSTRING = 300
const TIER_NAME_SUBSTRING = 200
const TIER_ADDRESS_PREFIX = 150

function scoreOne(a: Asset, q: string): SearchHit | null {
  const symbol = a.symbol.toLowerCase()
  const name = a.name.toLowerCase()
  const address = a.address.toLowerCase()

  if (symbol === q) return { asset: a, reason: 'ticker', score: TIER_EXACT_TICKER }
  if (address === q) return { asset: a, reason: 'address', score: TIER_EXACT_ADDRESS }
  if (symbol.startsWith(q)) {
    // A short query matching a short ticker is a better match than the same
    // query matching a long one: "pon" should surface PONS above PONSBALL.
    return { asset: a, reason: 'ticker', score: TIER_TICKER_PREFIX - (symbol.length - q.length) }
  }
  if (name.startsWith(q)) return { asset: a, reason: 'name', score: TIER_NAME_PREFIX }
  if (symbol.includes(q)) return { asset: a, reason: 'ticker', score: TIER_TICKER_SUBSTRING }
  if (name.includes(q)) return { asset: a, reason: 'name', score: TIER_NAME_SUBSTRING }
  if (q.startsWith('0x') && q.length >= 4 && address.startsWith(q)) {
    return { asset: a, reason: 'address', score: TIER_ADDRESS_PREFIX }
  }
  return null
}

/**
 * Rank `assets` against a query. An empty query returns the deepest names,
 * which is the right default for an empty palette: it is a shortlist of what is
 * actually tradeable, not an alphabetical dump.
 */
export function searchAssets(assets: Asset[], query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase()

  if (!q) {
    return [...assets]
      .sort((a, b) => b.liquidity - a.liquidity)
      .slice(0, limit)
      .map((asset) => ({ asset, reason: 'ticker' as const, score: 0 }))
  }

  const hits: SearchHit[] = []
  for (const a of assets) {
    const hit = scoreOne(a, q)
    if (hit) hits.push(hit)
  }

  hits.sort((x, y) => y.score - x.score || y.asset.liquidity - x.asset.liquidity)
  return hits.slice(0, limit)
}

/** True when the query looks like somebody pasted a contract address. */
export function looksLikeAddress(query: string): boolean {
  return /^0x[0-9a-f]{0,40}$/i.test(query.trim()) && query.trim().length >= 4
}
