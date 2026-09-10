/**
 * The long tail.
 *
 * Pons has deployed over four million tokens and mints north of twenty thousand
 * on a busy day. A fixed array cannot represent that, and a scanner that ends
 * after a hundred rows is a list, not a market.
 *
 * So coins beyond the known head are generated on demand from their index. The
 * generator is pure and deterministic: coin 41,203 is the same coin on every
 * device, on the server and the client, today and tomorrow. Nothing is stored,
 * nothing is fetched, and the feed never reaches a bottom.
 *
 * Index 0 is the most recent launch. Age grows with index at roughly the rate
 * Pons actually mints, so scrolling back through the feed walks backwards
 * through time the way it does on the real launchpad.
 */

import { between, gaussian, pick, rng } from './rng'
import type { Asset } from './types'
import { COINS as KNOWN_COINS, getAsset } from './assets'

/** Tokens Pons has deployed in total, from its own API on 2026-09-10. */
export const PONS_LAUNCH_TOTAL = 4_228_127
/** Tokens that have cleared the graduation threshold. */
export const PONS_GRADUATED_TOTAL = 10_532
/** Launches in a single day, at the pace reported for 30 August 2026. */
export const PONS_LAUNCHES_PER_DAY = 22_581

/** Minutes between consecutive launches, derived from the daily mint rate. */
const MINUTES_PER_LAUNCH = (24 * 60) / PONS_LAUNCHES_PER_DAY

// ---------------------------------------------------------------------------
// Naming.
//
// The word lists are built from what the launchpad actually produces: a stream
// of two-word compounds that read like they came out of a model, punctuated by
// direct references to Musk, Robinhood, dogs and cats. Nothing here is meant to
// be clever — it is meant to be indistinguishable from the real feed.
// ---------------------------------------------------------------------------

const ADJECTIVES = [
  'Charred', 'Viridian', 'Gilt', 'Lucky', 'Blowfly', 'Pocket', 'Pantry', 'Baby', 'Retro', 'Lead',
  'Stereo', 'Sonar', 'Fault', 'Herd', 'Ailur', 'Meridian', 'Demitasse', 'Chassis', 'Slip', 'Ester',
  'Quiet', 'Molten', 'Hollow', 'Copper', 'Velvet', 'Iron', 'Paper', 'Glass', 'Amber', 'Cobalt',
  'Feral', 'Static', 'Polar', 'Rusted', 'Salted', 'Bitter', 'Marbled', 'Tidal', 'Ember', 'Onyx',
]

const NOUNS = [
  'Meridian', 'Plinth', 'Vanity', 'Clack', 'Vesta', 'Vivarium', 'Mouser', 'Asteroid', 'Media',
  'Trial', 'Patch', 'Stray', 'Trace', 'Tag', 'Standard', 'Calibre', 'Noir', 'Rose', 'Cast',
  'Assay', 'Crate', 'Star', 'Brand', 'Combo', 'Runner', 'Leaflet', 'Board', 'Ledger', 'Foundry',
  'Lantern', 'Circuit', 'Orbit', 'Pulse', 'Velocity', 'Harbor', 'Signal', 'Anchor', 'Relay',
  'Lattice', 'Beacon', 'Cinder', 'Furnace', 'Quarry', 'Terminal', 'Archive', 'Kiln', 'Mantle',
]

/** The half of the feed that is not trying to sound like anything. */
const MEME_ROOTS = [
  'Doge', 'Cat', 'Frog', 'Inu', 'Shiba', 'Pepe', 'Wojak', 'Chad', 'Moon', 'Rocket', 'Diamond',
  'Bag', 'Ape', 'Bull', 'Bear', 'Whale', 'Degen', 'Gwei', 'Rug', 'Pump', 'Floki', 'Elon', 'Mars',
  'Starship', 'Cyber', 'Hood', 'Stonk', 'Tendie', 'Yolo', 'Vlad', 'Broker', 'Margin', 'Ticker',
]

const MEME_QUALIFIERS = [
  'Baby', 'Mega', 'Turbo', 'Based', 'Giga', 'Micro', 'Super', 'Hyper', 'Neo', 'Ultra', 'Lil',
  'Space', 'Quantum', 'Golden', 'Infinite', 'Eternal', 'Rogue', 'Wild',
]

const MEME_SUFFIXES = ['coin', 'Coin', 'Token', 'Cash', 'Fi', 'DAO', 'Swap', 'Verse', 'World', 'Club']

/** Quote assets, weighted the way the real launchpad weights them. */
const QUOTES = [
  'SPCX', 'SPCX', 'SPCX', 'SPCX', 'SPCX', 'SPCX',
  'ETH', 'ETH', 'ETH', 'ETH',
  'USDG', 'USDG',
  'NVDA', 'MSFT', 'TSLA', 'GOOGL', 'SPY', 'QQQ', 'AAPL', 'COIN', 'NFLX', 'HIMS', 'cbBTC',
]

const CASH_QUOTES = new Set(['USDG', 'ETH', 'cbBTC', 'WETH'])

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function nameFor(next: () => number): string {
  const roll = next()
  if (roll < 0.42) return `${pick(next, ADJECTIVES)} ${pick(next, NOUNS)}`
  if (roll < 0.6) return `${pick(next, MEME_QUALIFIERS)} ${pick(next, MEME_ROOTS)}`
  if (roll < 0.76) return `${pick(next, MEME_ROOTS)}${pick(next, MEME_SUFFIXES)}`
  if (roll < 0.86) return `${pick(next, MEME_ROOTS)} ${pick(next, NOUNS)}`
  if (roll < 0.94) return pick(next, NOUNS)
  return `${pick(next, MEME_QUALIFIERS)} ${pick(next, MEME_ROOTS)}${pick(next, MEME_SUFFIXES)}`
}

/**
 * Tickers are derived from the name the way a deployer would derive one, and
 * then salted with the index so two "Baby Doge" launches never collide. The
 * salt is what makes the symbol a usable primary key across four million rows.
 */
function symbolFor(name: string, index: number, next: () => number): string {
  const words = name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean)
  let base: string
  const roll = next()
  if (words.length >= 2 && roll < 0.4) base = (words[0].slice(0, 3) + words[1].slice(0, 3))
  else if (roll < 0.7) base = words[words.length - 1].slice(0, 6)
  else base = words.join('').slice(0, 7)

  base = base.toUpperCase().replace(/[^A-Z]/g, '')
  if (base.length < 2) base = 'PONS'
  // Base-36 keeps the suffix short even at index four million. Live launches
  // sit at negative indices and get an L prefix, because a minus sign has no
  // business in a ticker or a URL.
  return index < 0
    ? `${base}L${(-index).toString(36).toUpperCase()}`
    : `${base}${index.toString(36).toUpperCase()}`
}

const HEX = '0123456789abcdef'

function addressFor(next: () => number): string {
  let out = '0x'
  for (let i = 0; i < 40; i++) out += HEX[Math.floor(next() * 16)]
  return out
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const cache = new Map<number, Asset>()

/**
 * The coin at `index`, counting back from the most recent launch.
 *
 * Negative indices are launches that happened after the page loaded: the live
 * feed walks −1, −2, −3 as tokens land. They are generated the same way, they
 * are simply brand new.
 */
export function coinAt(index: number): Asset {
  const hit = cache.get(index)
  if (hit) return hit

  const next = rng(`pons:tail:${index}`)
  const name = nameFor(next)
  const symbol = symbolFor(name, index, next)

  // Age walks backwards at the launchpad's real mint rate, with enough jitter
  // that the feed does not tick like a metronome. A live launch is seconds old.
  const ageMinutes =
    index < 0 ? 0.05 : Math.max(index * MINUTES_PER_LAUNCH * between(next, 0.6, 1.4), 0.2)

  // Market cap is a power law with a fat tail: almost everything is dust, and
  // roughly one in two hundred is the thing somebody actually made money on.
  const lottery = next()
  const marketCap =
    lottery > 0.995
      ? between(next, 250_000, 4_000_000)
      : lottery > 0.96
        ? between(next, 30_000, 250_000)
        : between(next, 900, 30_000)

  // Supply is fixed on Pons, so price falls out of cap and an arbitrary float.
  const supply = Math.round(between(next, 1e8, 1e12))
  const price = marketCap / supply

  const liquidity = marketCap * between(next, 0.04, 0.28)
  const graduationPct = Math.min(
    Math.round((liquidity / (marketCap * 0.3)) * between(next, 10, 100)),
    100,
  )

  const quote = pick(next, QUOTES)
  const stockPaired = !CASH_QUOTES.has(quote)
  const graduated = graduationPct >= 100

  // A token minutes old moves in whole multiples. One a month old has usually
  // stopped moving at all, because it is dead.
  const vol =
    ageMinutes < 60
      ? between(next, 4.5, 9)
      : ageMinutes < 1440
        ? between(next, 2.6, 5)
        : between(next, 1.2, 3)

  // Returns are asymmetric and must stay that way: a token can go up 2000% and
  // can only ever go down 100%. Draw in log space and convert, which enforces
  // the floor by construction rather than by clamping after the fact.
  const swing = ageMinutes < 60 ? 1.5 : ageMinutes < 1440 ? 0.75 : 0.4
  const logReturn = (scale: number) => Math.exp(gaussian(next) * scale - scale * 0.35) - 1
  const change24h = logReturn(swing) * 100
  const change1h = logReturn(swing * 0.45) * 100
  const change7d = (Math.exp(Math.log(1 + change24h / 100) * between(next, 0.9, 2.2)) - 1) * 100

  const asset: Asset = {
    symbol,
    name: titleCase(name),
    tokenName: name,
    sector: stockPaired ? 'Stock-paired meme' : graduated ? 'Memecoin' : 'Launchpad',
    assetClass: 'coin',
    quote,
    ageHours: ageMinutes / 60,
    graduationPct,
    launchpad: 'Pons',
    private: false,
    address: addressFor(next),
    // Procedurally generated, so the address is not something anyone read off
    // the chain. The rail says so rather than implying otherwise.
    verifiedAddress: false,
    logoHue: Math.floor(next() * 360),
    price,
    anchor: price,
    change1h,
    change24h,
    change7d,
    volume24h: liquidity * between(next, 0.8, 22),
    liquidity,
    marketCap,
    holders: Math.max(Math.floor(between(next, 3, 40) + marketCap / 900), 2),
    // Nothing in the tail can be shorted. That is the entire point.
    borrowFee: between(next, 0.8, 6.5),
    fundingRate: between(next, -0.004, 0.004),
    shortInterest: between(next, 0, 0.04),
    openInterest: liquidity * between(next, 0.05, 0.4),
    phase: 'open',
    vol,
    drift: between(next, -1.2, 0.6),
    shortRoute: 'none',
    collateralOnly: false,
    wholeSharesOnly: false,
    uiMultiplier: 1,
  }

  cache.set(index, asset)
  return asset
}

/** A slice of the feed, newest first. */
/** Everything the tail can be asked for, newest first. */
export function coinPage(offset: number, limit: number): Asset[] {
  const out: Asset[] = []
  for (let i = offset; i < offset + limit; i++) out.push(coinAt(i))
  return out
}

// ---------------------------------------------------------------------------
// Resolution
//
// A URL like /t/CINDX7 has to resolve to a coin without a table of four million
// rows. Symbols carry their index in base 36 as a suffix, so the index can be
// read straight back out of the symbol and the coin regenerated from it.
// ---------------------------------------------------------------------------

const KNOWN_BY_SYMBOL = new Map(KNOWN_COINS.map((c) => [c.symbol, c]))

export function resolveCoin(symbol: string): Asset | undefined {
  const known = KNOWN_BY_SYMBOL.get(symbol)
  if (known) return known

  if (!/^[A-Z][0-9A-Z]+$/.test(symbol)) return undefined

  // The split between the name-derived stem and the base-36 index is ambiguous
  // — FAUMOUVSJ could be FAUMOU+VSJ or FAUMOUV+SJ — so every split is tried and
  // the one whose regenerated coin reproduces the symbol exactly is the answer.
  // At most a handful of candidates, each a single pure generation.
  for (let cut = Math.min(symbol.length - 1, 7); cut >= 2; cut--) {
    const suffix = symbol.slice(cut)
    const live = suffix.startsWith('L')
    const digits = live ? suffix.slice(1) : suffix
    if (!digits) continue

    const magnitude = parseInt(digits, 36)
    if (!Number.isFinite(magnitude) || magnitude < 0 || magnitude > PONS_LAUNCH_TOTAL) continue

    const index = live ? -magnitude : magnitude
    if (index === 0 && live) continue
    if (coinAt(index).symbol === symbol) return coinAt(index)
  }
  return undefined
}

/**
 * Any symbol in the product: a tokenized equity, a known coin, or a token from
 * the four-million-row tail regenerated from its own ticker.
 */
export function resolveAsset(symbol: string): Asset | undefined {
  return getAsset(symbol) ?? resolveCoin(symbol)
}

/** How many launches sit between now and a given age, at the current mint rate. */
export function indexForAge(minutes: number): number {
  return Math.max(Math.round(minutes / MINUTES_PER_LAUNCH), 0)
}
