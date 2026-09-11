/**
 * The paper oracle: one canonical price series per token, and TWAPs over it.
 *
 * Everything that shows or settles against a price — the list row, the chart's
 * TWAP overlay, a position's marks, a receipt's samples — reads from here, so
 * the TWAP on the sheet is the TWAP in the list is the TWAP that knocked a
 * position out. Generating separate series per screen would make them disagree,
 * and a user comparing two screens would be right to call it a bug.
 *
 * TWAPs are genuinely time-weighted: history bars count for their five minutes,
 * and prices observed live since the page loaded count for exactly as long as
 * they were in force.
 */

import { generateCandles } from '@/lib/sim'
import type { Asset } from '@/lib/types'
import type { Candle, HistoryInterval, PriceHistory } from './adapter'
import type { PriceSample } from './types'
import { toFixed18 } from './fixed'

export const BAR_SECONDS = 300
/** Four days of five-minute bars: comfortably more than the 72h window. */
export const SERIES_BARS = 1152

export const WINDOW_24H = 24 * 3600
export const WINDOW_72H = 72 * 3600

const INTERVAL_SECONDS: Record<HistoryInterval, number> = {
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
}

export class TokenSeries {
  /** Closed five-minute bars, oldest first. */
  private bars: Candle[] = []
  /** Prices observed live, oldest first, time in seconds. */
  private live: { t: number; p: number }[] = []
  private endBucket = 0

  constructor(
    private readonly asset: Asset,
    /** Hours of history the token actually has; young launches are trimmed. */
    private readonly ageHours: number | undefined,
  ) {}

  /** Rebuild the history whenever the five-minute grid rolls over. */
  private ensure(nowMs: number) {
    const bucket = Math.floor(nowMs / 1000 / BAR_SECONDS) * BAR_SECONDS
    if (bucket === this.endBucket && this.bars.length) return
    this.endBucket = bucket

    // A fixed count keeps the seed — and therefore the path — stable; young
    // tokens are trimmed afterwards rather than generated shorter, or their
    // whole history would redraw every five minutes as they age.
    const full = generateCandles(this.asset, '5m', SERIES_BARS, bucket)
    const ageBars =
      this.ageHours === undefined
        ? SERIES_BARS
        : Math.max(Math.min(Math.floor((this.ageHours * 3600) / BAR_SECONDS), SERIES_BARS), 1)
    this.bars = full.slice(full.length - ageBars)
  }

  /** Record the spot. Called by the sampler; cheap. */
  observe(price: number, nowMs: number) {
    const t = nowMs / 1000
    const last = this.live[this.live.length - 1]
    if (last && last.p === price) return
    this.live.push({ t, p: price })
    // Anything older than the longest window can never be read again.
    const cutoff = t - WINDOW_72H
    while (this.live.length > 2 && this.live[1].t < cutoff) this.live.shift()
  }

  /**
   * Multiply recent history by `factor`. Paper-mode test lever only: it lets a
   * developer stand in a market that has already moved, so the knock-out and
   * receipt paths can be exercised without waiting three days for a TWAP.
   */
  shock(factor: number, nowMs: number) {
    this.ensure(nowMs)
    this.shockFactor *= factor
    this.live = this.live.map((s) => ({ t: s.t, p: s.p * factor }))
  }
  private shockFactor = 1

  private barPrice(bar: Candle) {
    return bar.close * this.shockFactor
  }

  /**
   * Time-weighted average over the trailing window. When the token is younger
   * than the window, the average runs over what exists — which is exactly why
   * WARMUP blocks opening until 24h of it does.
   */
  twap(windowSec: number, nowMs: number): number {
    this.ensure(nowMs)
    const now = nowMs / 1000
    const start = now - windowSec
    let area = 0
    let cursor = now

    for (let i = this.live.length - 1; i >= 0 && cursor > start; i--) {
      const from = Math.max(this.live[i].t, start)
      if (from < cursor) {
        area += this.live[i].p * (cursor - from)
        cursor = from
      }
    }

    for (let i = this.bars.length - 1; i >= 0 && cursor > start; i--) {
      const barStart = this.bars[i].time
      const barEnd = barStart + BAR_SECONDS
      const to = Math.min(barEnd, cursor)
      const from = Math.max(barStart, start)
      if (to > from) {
        area += this.barPrice(this.bars[i]) * (to - from)
        cursor = from
      }
    }

    const covered = now - cursor
    return covered > 0 ? area / covered : this.spot(nowMs)
  }

  spot(nowMs: number): number {
    this.ensure(nowMs)
    const last = this.live[this.live.length - 1]
    if (last) return last.p
    const bar = this.bars[this.bars.length - 1]
    return bar ? this.barPrice(bar) : this.asset.price
  }

  /** Seconds of history that exist. */
  historySeconds(nowMs: number): number {
    this.ensure(nowMs)
    const first = this.bars[0]
    return first ? nowMs / 1000 - first.time : 0
  }

  /**
   * The samples a TWAP was computed from, oldest first — five-minute closes
   * plus the live observations after them. This is what a receipt shows.
   */
  samples(windowSec: number, nowMs: number): PriceSample[] {
    this.ensure(nowMs)
    const start = nowMs / 1000 - windowSec
    const out: PriceSample[] = []
    for (const bar of this.bars) {
      if (bar.time + BAR_SECONDS <= start) continue
      out.push({ at: (bar.time + BAR_SECONDS) * 1000, price: toFixed18(this.barPrice(bar)) })
    }
    for (const s of this.live) {
      if (s.t < start) continue
      out.push({ at: Math.round(s.t * 1000), price: toFixed18(s.p) })
    }
    return out
  }

  /**
   * Chart data at a coarser interval, with both TWAP lines evaluated at every
   * bar close. Aggregated from the same five-minute bars, never regenerated.
   */
  history(interval: HistoryInterval, nowMs: number): PriceHistory {
    this.ensure(nowMs)
    const step = INTERVAL_SECONDS[interval]
    const per = step / BAR_SECONDS

    const candles: Candle[] = []
    for (let i = 0; i < this.bars.length; i += per) {
      const chunk = this.bars.slice(i, i + per)
      if (!chunk.length) continue
      candles.push({
        time: Math.floor(chunk[0].time / step) * step,
        open: chunk[0].open * this.shockFactor,
        high: Math.max(...chunk.map((b) => b.high)) * this.shockFactor,
        low: Math.min(...chunk.map((b) => b.low)) * this.shockFactor,
        close: chunk[chunk.length - 1].close * this.shockFactor,
        volume: chunk.reduce((s, b) => s + b.volume, 0),
      })
    }

    // Rolling sums over the five-minute closes give both TWAPs at every bar in
    // one pass, instead of re-integrating the window for each point.
    const prefix = [0]
    for (const b of this.bars) prefix.push(prefix[prefix.length - 1] + this.barPrice(b))
    const rolling = (endIdx: number, windowBars: number) => {
      const from = Math.max(endIdx - windowBars, 0)
      const n = endIdx - from
      return n > 0 ? (prefix[endIdx] - prefix[from]) / n : NaN
    }

    const twap24h: { time: number; value: number }[] = []
    const twap72h: { time: number; value: number }[] = []
    for (let c = 0; c < candles.length; c++) {
      const endIdx = Math.min((c + 1) * per, this.bars.length)
      twap24h.push({ time: candles[c].time, value: rolling(endIdx, WINDOW_24H / BAR_SECONDS) })
      twap72h.push({ time: candles[c].time, value: rolling(endIdx, WINDOW_72H / BAR_SECONDS) })
    }

    // The last point of each line is the live TWAP, so the overlay ends where
    // the list and the positions say it is.
    if (candles.length) {
      twap24h[twap24h.length - 1].value = this.twap(WINDOW_24H, nowMs)
      twap72h[twap72h.length - 1].value = this.twap(WINDOW_72H, nowMs)
      const last = candles[candles.length - 1]
      const spot = this.spot(nowMs)
      last.close = spot
      last.high = Math.max(last.high, spot)
      last.low = Math.min(last.low, spot)
    }

    return { candles, twap24h, twap72h }
  }
}
