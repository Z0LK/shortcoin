/**
 * Regenerates lib/assets.ts from the Robinhood Chain asset registry captured
 * during research (194 active Stock Tokens, real symbols, real sectors, real
 * contract addresses where they were read on-chain).
 *
 * Run with: npx tsx scripts/gen-assets.ts
 * Prices and market stats are invented; identity and short-route data are not.
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { rng, between } from '../lib/rng'

const REGISTRY = readFileSync(new URL('./registry.txt', import.meta.url), 'utf8')
const COINS = readFileSync(new URL('./coins.txt', import.meta.url), 'utf8')

/** The 44 tokens with a live Lighter perp — the only ones shortable via perps. */
const LIGHTER_PERPS = new Set(
  `AAOI AAPL AMD AMZN ASML AVGO AXTI BABA BB BE CBRS COIN CRCL CRWV DELL EWY GEV GME GOOGL IBM INTC
   LITE META MRNA MRVL MSFT MSTR MU NBIS NOW NVDA ORCL PLTR QCOM QQQ RKLB SKHY SNDK SPCX SPY TSLA
   TSM TTWO WDC`.split(/\s+/).filter(Boolean),
)

/** Tokens with a Morpho market where the stock token is borrowable. All sit at $0 supplied. */
const MORPHO_BORROW = new Set(['AAPL', 'GOOGL', 'NVDA', 'SPY', 'TSLA'])

/** Tokens usable only as Morpho collateral, i.e. long leverage and nothing else. */
const MORPHO_COLLATERAL = new Set(
  `AAPL AMD AMZN ASML AVGO BABA COIN COST CRCL CRM CRWD CRWV CSCO DELL GLD GOOGL HOOD IBM INTC INTU
   JNJ LLY LMT META MRVL MSFT MSTR MU NET NFLX NOW NVDA ORCL PANW PFE PLTR QCOM QQQ SHOP SMCI SNOW
   SPY TSLA TSM UNH VTI WDC XOM`.split(/\s+/).filter(Boolean),
)

/** Whole-share-only tokens: fractional trading is disabled by the issuer. */
const WHOLE_SHARES_ONLY = new Set(['WYFI', 'SLS', 'XNDU'])

/** ERC-8056 uiMultiplier values that are not exactly 1. Read on-chain. */
const UI_MULTIPLIER: Record<string, number> = {
  CRWD: 4, CCL: 1.021486, SGOV: 1.005102, KSS: 1.00461, UPS: 1.002209,
  ORCL: 1.002211, NVDA: 1.000775, COST: 1.000612, AAPL: 1.000566,
  WDC: 1.000218, F: 1.000146, ASML: 1.000101,
}

/** Reference prices for names a reader would recognise. Everything else is derived. */
const KNOWN_PRICES: Record<string, number> = {
  AAPL: 268.42, MSFT: 512.63, NVDA: 214.86, AMZN: 246.71, GOOGL: 289.54, META: 724.31,
  TSLA: 412.9, AVGO: 386.24, AMD: 198.35, ORCL: 284.9, CRM: 248.12, ADBE: 402.7,
  PLTR: 172.94, MU: 156.42, INTC: 38.75, ASML: 1042.6, TSM: 328.4, QCOM: 186.2,
  NFLX: 1128.64, SNAP: 9.84, RDDT: 214.3, RBLX: 128.7, SHOP: 168.4, COIN: 342.6,
  MSTR: 268.42, CRCL: 164.2, GME: 24.8, AMC: 3.42, DJT: 18.6, SPY: 712.4, QQQ: 618.9,
  GLD: 384.6, SLV: 42.8, VTI: 348.2, SMH: 386.4, XLK: 328.9, SGOV: 100.4, SHY: 82.6,
  BND: 74.2, USO: 78.4, BA: 214.8, LMT: 486.2, GE: 298.4, RKLB: 62.9, SPCX: 226.4,
  LLY: 892.4, PFE: 26.42, JNJ: 168.4, UNH: 342.7, XOM: 118.62, F: 12.84, RIVN: 14.6,
  COST: 962.4, IBM: 286.4, CSCO: 74.2, SNOW: 168.4, DDOG: 142.6, NET: 186.4, ZM: 84.2,
  CRWD: 428.6, PANW: 194.2, ZS: 268.4, FTNT: 98.4, SMCI: 41.6, DELL: 142.3, HPE: 24.8,
  IONQ: 48.2, RGTI: 32.6, QBTS: 28.4, OKLO: 96.4, SMR: 42.8, VST: 218.6, CEG: 342.8,
  LULU: 214.5, CVNA: 386.4, CELH: 42.6, ELF: 86.4, NU: 16.8, SOFI: 24.6, HOOD: 128.3,
}

interface Row {
  ticker: string
  name: string
  sector: string
  address?: string
}

interface CoinRow {
  ticker: string
  name: string
  sector: string
  price: number
  quote: string
  ageDays: number
  tier: number
}

const coinRows: CoinRow[] = COINS.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const [ticker, name, sector, price, quote, ageDays, tier] = l.split('|').map((x) => x.trim())
    return {
      ticker,
      name,
      sector,
      price: Number(price),
      quote,
      ageDays: Number(ageDays),
      tier: Number(tier),
    }
  })

const rows: Row[] = REGISTRY.split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [ticker, name, sector, address] = l.split('|').map((s) => s.trim())
    return { ticker, name, sector, address: address || undefined }
  })

/** Price bands by sector, used for the names we have no reference price for. */
function bandFor(sector: string): [number, number] {
  if (sector.startsWith('ETF - Bonds')) return [70, 110]
  if (sector.startsWith('ETF')) return [40, 700]
  if (sector === 'Quantum Computing' || sector === 'Crypto Mining') return [4, 60]
  if (sector === 'Space & Satellite' || sector === 'Clean Energy') return [6, 90]
  if (sector === 'Aerospace & Defense' || sector === 'Semiconductors') return [30, 420]
  if (sector === 'Biotechnology' || sector === 'Healthcare') return [8, 220]
  return [15, 320]
}

/** Annualised volatility priors. Speculative sectors are genuinely wilder. */
function volFor(sector: string): number {
  if (sector.startsWith('ETF - Bonds')) return 0.06
  if (sector.startsWith('ETF - Commodities')) return 0.18
  if (sector.startsWith('ETF')) return 0.19
  if (sector === 'Quantum Computing') return 0.95
  if (sector === 'Crypto Mining' || sector === 'Crypto Treasury') return 0.88
  if (sector === 'Crypto Financials') return 0.74
  if (sector === 'Space & Satellite') return 0.72
  if (sector === 'Nuclear Energy' || sector === 'Clean Energy') return 0.68
  if (sector === 'Semiconductors') return 0.46
  if (sector === 'Healthcare' || sector === 'Consumer Staples') return 0.26
  return 0.38
}

function fakeAddress(next: () => number): string {
  const chars = '0123456789abcdef'
  let out = '0x'
  for (let i = 0; i < 40; i++) out += chars[Math.floor(next() * 16)]
  return out
}

function shortRoute(t: string): 'borrow' | 'perp' | 'none' {
  if (MORPHO_BORROW.has(t)) return 'borrow'
  if (LIGHTER_PERPS.has(t)) return 'perp'
  return 'none'
}

const equitySeeds = rows.map((r) => {
  const next = rng(`rhc:${r.ticker}`)
  const [lo, hi] = bandFor(r.sector)
  const price = KNOWN_PRICES[r.ticker] ?? Number(between(next, lo, hi).toFixed(2))
  return {
    ticker: r.ticker,
    name: r.name,
    sector: r.sector,
    price,
    address: r.address ?? fakeAddress(next),
    real: !!r.address,
    route: shortRoute(r.ticker),
    collateralOnly: MORPHO_COLLATERAL.has(r.ticker) && shortRoute(r.ticker) === 'none',
    wholeSharesOnly: WHOLE_SHARES_ONLY.has(r.ticker),
    uiMultiplier: UI_MULTIPLIER[r.ticker] ?? 1,
    vol: Number(volFor(r.sector).toFixed(3)),
    cls: 'equity' as const,
    quote: 'USDG',
    age: 0,
    tier: 0,
  }
})

/**
 * Coins are a different animal. Nothing anchors them to a share, so volatility
 * is measured in whole multiples rather than percentages, depth is thin, and a
 * token can be four days old. None of them can be shorted anywhere: no perp
 * lists a Robinhood Chain memecoin and no lender will take one as a borrow.
 */
const coinSeeds = coinRows.map((r) => {
  const next = rng(`rhc:coin:${r.ticker}`)
  const vol =
    r.sector === 'Infrastructure' ? 0.62 : r.sector === 'Launchpad' ? 1.45 : 1.9 - r.tier * 0.16
  return {
    ticker: r.ticker,
    name: r.name,
    sector: r.sector,
    price: r.price,
    address: fakeAddress(next),
    real: false,
    route: 'none' as const,
    collateralOnly: false,
    wholeSharesOnly: false,
    uiMultiplier: 1,
    vol: Number(vol.toFixed(3)),
    cls: 'coin' as const,
    quote: r.quote,
    age: r.ageDays,
    tier: r.tier,
  }
})

const seeds = [...equitySeeds, ...coinSeeds]

const sectors = [...new Set(seeds.map((s) => s.sector))].sort()

const counts = {
  total: seeds.length,
  equities: equitySeeds.length,
  coins: coinSeeds.length,
  borrow: seeds.filter((s) => s.route === 'borrow').length,
  perp: seeds.filter((s) => s.route === 'perp').length,
  none: seeds.filter((s) => s.route === 'none').length,
}

const body = `/**
 * SHORTCOIN — the Robinhood Chain universe.
 *
 * GENERATED by scripts/gen-assets.ts. Edit that script, not this file.
 *
 * What is real here: the ${counts.total} ticker symbols, the company names, the sector
 * taxonomy, the contract addresses that were read on-chain, the ERC-8056 uiMultiplier
 * values, and — most importantly — which tokens actually have a way to be shorted today.
 *
 * What is invented: every price, every liquidity, holder and volume figure, every borrow
 * and funding rate. Those exist to populate a simulation.
 *
 * The short-route census is the whole reason this product exists:
 *   ${counts.borrow} tokens have a spot borrow market (all of them sitting at zero supplied)
 *   ${counts.perp} tokens have a perp somewhere
 *   ${counts.none} tokens — ${Math.round((counts.none / counts.total) * 100)}% of the chain — have no way to go short at all
 */

import type { Asset, AssetClass, MarketPhase, ShortRoute } from './types'
import { between, rng } from './rng'

export const CHAIN = {
  name: 'Robinhood Chain',
  short: 'RHC',
  /** Verified via eth_chainId returning 0x1237. */
  chainId: 4663,
  rpc: 'https://rpc.mainnet.chain.robinhood.com',
  explorer: 'https://robinhoodchain.blockscout.com',
  gasToken: 'ETH',
  /** Global Dollar is the chain's primary quote asset, not USDC. */
  settlement: 'USDG',
  settlementAddress: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
  blockTimeMs: 100,
  stack: 'Arbitrum Orbit',
} as const

/** Census of how shortable this chain actually is. Drives the product's pitch. */
export const SHORT_CENSUS = {
  total: ${counts.total},
  equities: ${counts.equities},
  coins: ${counts.coins},
  borrow: ${counts.borrow},
  perp: ${counts.perp},
  none: ${counts.none},
} as const

interface Seed {
  t: string
  n: string
  s: string
  p: number
  a: string
  real: boolean
  r: ShortRoute
  col: boolean
  whole: boolean
  mult: number
  v: number
  c: AssetClass
  q: string
  age: number
  tier: number
}

const SEEDS: Seed[] = ${JSON.stringify(
  seeds.map((s) => ({
    t: s.ticker,
    n: s.name,
    s: s.sector,
    p: s.price,
    a: s.address,
    real: s.real,
    r: s.route,
    col: s.collateralOnly,
    whole: s.wholeSharesOnly,
    mult: s.uiMultiplier,
    v: s.vol,
    c: s.cls,
    q: s.quote,
    age: s.age,
    tier: s.tier,
  })),
  null,
  0,
)
  .replace(/\},\{/g, '},\n  {')
  .replace(/^\[/, '[\n  ')
  .replace(/\]$/, ',\n]')}

function build(seed: Seed): Asset {
  const next = rng(\`rhc:\${seed.t}:mkt\`)
  const isCoin = seed.c === 'coin'

  const vol = seed.v * between(next, 0.85, 1.25)
  const drift = between(next, -0.24, 0.34)
  const isEtf = seed.s.startsWith('ETF')

  // A memecoin does not move like a share. Nothing arbitrages it back to a
  // fair value, so the daily range is measured in tens of percent and the
  // youngest names are the wildest.
  const swing = isCoin ? (seed.tier >= 2 ? 26 : 55) : isEtf ? 2.7 : 9
  const change24h = between(next, -swing, swing)
  const change1h = change24h * between(next, 0.05, 0.5) + between(next, -1.4, 1.4) * (isCoin ? 6 : 1)
  const change7d = change24h * between(next, 0.6, 2.4)

  // Depth. For equities the short route is a decent proxy for attention; for
  // coins it is simply how established the token is.
  const tier = isCoin
    ? [0.02, 0.12, 0.8, 4][seed.tier] ?? 0.05
    : seed.r === 'borrow'
      ? 6
      : seed.r === 'perp'
        ? 2.4
        : 0.7
  const liquidity = between(next, 0.4e6, 18e6) * tier
  // Coins turn over their own float many times a day. Equities do not.
  const volume24h = liquidity * (isCoin ? between(next, 1.2, 14) : between(next, 0.4, 5.6))
  const marketCap = liquidity * (isCoin ? between(next, 8, 60) : between(next, 40, 900))

  // Borrow is the price of a short, so it is expensive exactly where shorting is
  // hard — which on this chain is almost everywhere, and worst of all on coins
  // that no lender will touch.
  const borrowFee = isCoin
    ? between(next, 0.6, 3.2) - seed.tier * 0.12
    : seed.r === 'none'
      ? between(next, 0.22, 0.95)
      : seed.r === 'perp'
        ? between(next, 0.03, 0.28)
        : between(next, 0.005, 0.06)

  const shortInterest = isCoin
    ? between(next, 0.0, 0.08)
    : seed.r === 'none'
      ? between(next, 0.02, 0.18)
      : between(next, 0.12, 0.66)
  const fundingRate = (shortInterest - 0.5) * -between(next, 0.0004, 0.0055)

  return {
    symbol: seed.t,
    underlying: isCoin ? undefined : seed.t,
    name: seed.n,
    /** The on-chain ERC-20 name. Stock tokens carry the issuer suffix; coins do not. */
    tokenName: isCoin ? seed.n : \`\${seed.n} • Robinhood Token\`,
    sector: seed.s,
    assetClass: seed.c,
    quote: seed.q,
    ageDays: isCoin ? seed.age : undefined,
    private: seed.t === 'SPCX',
    address: seed.a,
    verifiedAddress: seed.real,
    logoHue: Math.floor(next() * 360),
    price: seed.p,
    anchor: seed.p,
    change1h,
    change24h,
    change7d,
    volume24h,
    liquidity,
    marketCap,
    holders: Math.floor(
      between(next, 240, 96_000) * (isCoin ? 0.05 + seed.tier * 0.4 : seed.r === 'none' ? 0.4 : 1),
    ),
    borrowFee,
    fundingRate,
    shortInterest,
    openInterest: liquidity * between(next, 0.2, 1.8),
    phase: 'open' as MarketPhase,
    vol,
    drift,
    shortRoute: seed.r,
    collateralOnly: seed.col,
    wholeSharesOnly: seed.whole,
    uiMultiplier: seed.mult,
  }
}

export const ASSETS: Asset[] = SEEDS.map(build)

export const ASSET_BY_SYMBOL: Record<string, Asset> = Object.fromEntries(
  ASSETS.map((a) => [a.symbol, a]),
)

export function getAsset(symbol: string): Asset | undefined {
  return ASSET_BY_SYMBOL[symbol]
}

export const SECTORS: string[] = ${JSON.stringify(sectors, null, 0).replace(/","/g, '", "')}

/** Sectors that belong to native coins rather than tokenized equities. */
export const COIN_SECTORS: string[] = ${JSON.stringify(
  [...new Set(coinSeeds.map((c) => c.sector))].sort(),
  null,
  0,
).replace(/","/g, '", "')}

export const EQUITIES: Asset[] = ASSETS.filter((a) => a.assetClass === 'equity')
export const COINS: Asset[] = ASSETS.filter((a) => a.assetClass === 'coin')

export const SHORT_ROUTE_LABEL: Record<ShortRoute, string> = {
  borrow: 'Spot borrow',
  perp: 'Perp only',
  none: 'No short route',
}

/**
 * Equity market phase for a given moment, US Eastern.
 *
 * Stock Tokens trade on-chain 24/7, but the underlying venue does not — and the
 * mint/burn window that lets authorised participants arbitrage the peg is only open
 * Monday 02:00 CET through Saturday 02:00 CET. Outside it, nothing keeps the token
 * tied to the share, and spreads widen. That is a real property of this asset class
 * and the interface has to say so.
 */
export function marketPhase(now = new Date()): MarketPhase {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  const minutes = et.getHours() * 60 + et.getMinutes()
  if (day === 0 || day === 6) return 'closed'
  if (minutes >= 570 && minutes < 960) return 'open'
  if (minutes >= 240 && minutes < 570) return 'pre'
  if (minutes >= 960 && minutes < 1200) return 'after'
  return 'closed'
}

export const PHASE_LABEL: Record<MarketPhase, string> = {
  open: 'Market open',
  pre: 'Pre-market',
  after: 'After hours',
  closed: 'Market closed',
}

/**
 * Whether the mint/burn window is open. When it is shut there is no authorised
 * participant arbitrage, so the token can drift from the share it tracks.
 */
export function tokenizationWindowOpen(now = new Date()): boolean {
  const cet = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const day = cet.getDay()
  const hour = cet.getHours()
  if (day === 6) return hour < 2
  if (day === 0) return false
  if (day === 1) return hour >= 2
  return true
}
`

writeFileSync(new URL('../lib/assets.ts', import.meta.url), body)
console.log(
  `wrote lib/assets.ts — ${counts.total} assets (${counts.equities} equities, ${counts.coins} coins), ${sectors.length} sectors`,
)
console.log(`short routes: borrow ${counts.borrow} · perp ${counts.perp} · none ${counts.none}`)
