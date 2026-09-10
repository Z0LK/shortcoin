/**
 * SHORTCOIN — fake market engine.
 *
 * Generates believable OHLCV history and then keeps it alive with a tick loop.
 * Nothing here touches a network. When a real feed arrives, `MarketEngine` is
 * the only thing that has to be replaced: it already exposes the subscribe /
 * snapshot surface the UI consumes.
 */

import type { Asset, Candle, Trade, UtcSeconds } from './types'
import { gaussian, rng, seedFrom } from './rng'

export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

export const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d']

export const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
}

/** Current time floored to the interval grid, so bars line up cleanly. */
export function bucketNow(interval: Interval, now = Date.now()): UtcSeconds {
  const step = INTERVAL_SECONDS[interval]
  return Math.floor(now / 1000 / step) * step
}

/**
 * Deterministic OHLCV history ending at `endTime`.
 *
 * Geometric brownian motion with three things bolted on to stop it looking like
 * a textbook: occasional jumps (news), volatility clustering (calm stretches
 * then violent ones), and volume that spikes with range rather than drifting.
 * The walk is generated BACKWARDS from the asset's current price so the last
 * close always equals `asset.price` exactly — the table and the chart can never
 * disagree.
 */
export function generateCandles(
  asset: Pick<Asset, 'symbol' | 'price' | 'vol' | 'drift' | 'volume24h'>,
  interval: Interval,
  count = 320,
  endTime = bucketNow(interval),
): Candle[] {
  const step = INTERVAL_SECONDS[interval]
  const next = rng(`${asset.symbol}:${interval}:${count}`)

  // Per-bar volatility, scaled from the asset's annualised vol.
  const barsPerYear = (365 * 24 * 3600) / step
  const sigma = asset.vol / Math.sqrt(barsPerYear)
  const mu = asset.drift / barsPerYear

  // Walk backwards in log space, then reverse.
  const closes: number[] = new Array(count)
  let price = asset.price
  let clustering = 1

  for (let i = count - 1; i >= 0; i--) {
    closes[i] = price
    clustering = 0.92 * clustering + 0.08 * (0.4 + next() * 1.8)
    const shock = gaussian(next) * sigma * clustering
    const jump = next() < 0.012 ? gaussian(next) * sigma * 9 : 0
    price = price / Math.exp(mu + shock + jump)
    if (!Number.isFinite(price) || price <= 0) price = asset.price
  }

  const avgBarVolume = asset.volume24h / Math.max((24 * 3600) / step, 1)
  const candles: Candle[] = []

  for (let i = 0; i < count; i++) {
    const close = closes[i]
    const open = i === 0 ? close / Math.exp(gaussian(next) * sigma) : closes[i - 1]
    const body = Math.abs(close - open)
    const wick = (0.25 + next() * 1.5) * Math.max(body, close * sigma * 0.6)
    const high = Math.max(open, close) + wick * next()
    const low = Math.min(open, close) - wick * next()
    const range = (high - low) / close
    const volume = Math.max(
      avgBarVolume * (0.25 + next() * 0.9 + (range / Math.max(sigma, 1e-9)) * 0.18),
      1,
    )
    candles.push({
      time: endTime - (count - 1 - i) * step,
      open,
      high: Math.max(high, open, close),
      low: Math.max(Math.min(low, open, close), 1e-9),
      close,
      volume,
    })
  }

  return candles
}

/** One simulated tick applied to the working bar. */
export interface Tick {
  symbol: string
  price: number
  candle: Candle
  /** True when this tick opened a brand new bar. */
  rolled: boolean
}

type Listener = (tick: Tick) => void

/**
 * Drives live prices for a set of assets.
 *
 * The engine owns one working candle per (symbol, interval) and mutates it on
 * every tick, rolling to a fresh bar when the interval boundary passes — the
 * same contract `ISeriesApi.update()` expects, so the chart never has to redraw
 * its whole dataset.
 */
export class MarketEngine {
  private assets = new Map<string, Asset>()
  private working = new Map<string, Candle>()
  private listeners = new Map<string, Set<Listener>>()
  private random = new Map<string, () => number>()
  private timer: ReturnType<typeof setInterval> | null = null
  private clock = 0

  constructor(
    assets: Asset[],
    private interval: Interval = '1m',
    private tickMs = 900,
  ) {
    assets.forEach((a) => {
      this.assets.set(a.symbol, { ...a })
      this.random.set(a.symbol, rng(seedFrom(a.symbol) ^ 0x9e3779b9))
    })
  }

  setInterval_(interval: Interval) {
    this.interval = interval
    this.working.clear()
  }

  snapshot(symbol: string): Asset | undefined {
    return this.assets.get(symbol)
  }

  all(): Asset[] {
    return [...this.assets.values()]
  }

  subscribe(symbol: string, fn: Listener): () => void {
    const set = this.listeners.get(symbol) ?? new Set<Listener>()
    set.add(fn)
    this.listeners.set(symbol, set)
    return () => set.delete(fn)
  }

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), this.tickMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Seed the working bar from the tail of a generated history. */
  prime(symbol: string, last: Candle) {
    this.working.set(symbol, { ...last })
  }

  private tick() {
    this.clock++
    const step = INTERVAL_SECONDS[this.interval]
    const bucket = bucketNow(this.interval)

    for (const asset of this.assets.values()) {
      const next = this.random.get(asset.symbol)!
      // Only a slice of the book prints on any given tick — a 40-row scanner
      // where every number twitches at once reads as noise, not as a market.
      if (next() > 0.55) continue

      const barsPerYear = (365 * 24 * 3600) / step
      const sigma = asset.vol / Math.sqrt(barsPerYear)
      // A tick is a fraction of a bar, so scale the shock down accordingly.
      const ticksPerBar = Math.max((step * 1000) / this.tickMs, 1)
      const shock = (gaussian(next) * sigma) / Math.sqrt(ticksPerBar)
      const jump = next() < 0.0015 ? gaussian(next) * sigma * 4 : 0

      const price = Math.max(asset.price * Math.exp(shock + jump), 1e-6)
      asset.price = price

      let bar = this.working.get(asset.symbol)
      const rolled = !bar || bucket > bar.time

      if (!bar || rolled) {
        bar = { time: bucket, open: price, high: price, low: price, close: price, volume: 0 }
      }

      bar.close = price
      bar.high = Math.max(bar.high, price)
      bar.low = Math.min(bar.low, price)
      bar.volume += (asset.volume24h / ((24 * 3600) / step)) * (0.02 + next() * 0.06)
      this.working.set(asset.symbol, bar)

      // Keep the headline stats moving so the scanner feels alive.
      asset.change1h += shock * 100 * 0.6
      asset.change24h += shock * 100 * 0.25
      asset.volume24h *= 1 + next() * 0.0004

      const set = this.listeners.get(asset.symbol)
      if (set?.size) {
        const tick: Tick = { symbol: asset.symbol, price, candle: { ...bar }, rolled }
        set.forEach((fn) => fn(tick))
      }
    }
  }
}

const WALLET_CHARS = '0123456789abcdef'

/** A plausible-looking fake wallet address. */
export function fakeWallet(next: () => number): string {
  let out = '0x'
  for (let i = 0; i < 40; i++) out += WALLET_CHARS[Math.floor(next() * 16)]
  return out
}

/** Deterministic tape of recent prints for a symbol. */
export function generateTrades(asset: Asset, count = 60, now = Math.floor(Date.now() / 1000)): Trade[] {
  const next = rng(`${asset.symbol}:tape`)
  const trades: Trade[] = []
  let t = now
  for (let i = 0; i < count; i++) {
    t -= Math.floor(next() * 40) + 1
    const side = next() > 0.47 ? 'long' : 'short'
    const r = next()
    const tag = r > 0.94 ? 'whale' : r > 0.85 ? 'smart' : r > 0.78 ? 'fresh' : undefined
    trades.push({
      id: `${asset.symbol}-tp-${i}`,
      symbol: asset.symbol,
      side,
      price: asset.price * (1 + (next() - 0.5) * 0.006),
      size: (asset.volume24h / 8640) * (0.2 + next() * 6),
      time: t,
      wallet: fakeWallet(next),
      tag,
    })
  }
  return trades
}
