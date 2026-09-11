/**
 * End-to-end smoke check of the data layer: the asset universe, the candle
 * generator and the market engine, without a browser.
 */
import { ASSETS, marketPhase, PHASE_LABEL } from '../lib/assets'
import { generateCandles, MarketEngine } from '../lib/sim'
import { usdAbbr, pct, price } from '../lib/format'

async function main() {
  console.log('assets:', ASSETS.length, '| phase:', PHASE_LABEL[marketPhase()])
  const a = ASSETS.find((x) => x.symbol === 'TSLA')!
  const c = generateCandles(a, '5m', 300, 1757500000)
  console.log('candles:', c.length, 'lastClose=', c.at(-1)!.close.toFixed(2), 'assetPrice=', a.price)
  const bad = c.filter((x) => !(x.high >= Math.max(x.open, x.close) && x.low <= Math.min(x.open, x.close) && x.low > 0))
  console.log('invalid candles:', bad.length)
  console.log('deterministic:', JSON.stringify(c) === JSON.stringify(generateCandles(a, '5m', 300, 1757500000)))
  console.log('sample row:', a.symbol, price(a.price), pct(a.change24h), usdAbbr(a.volume24h))
  const eng = new MarketEngine(ASSETS, '1m', 50)
  let ticks = 0
  eng.subscribe('TSLA', () => ticks++)
  eng.start()
  await new Promise((r) => setTimeout(r, 400))
  eng.stop()
  console.log('engine ticks received:', ticks)
}
main()
