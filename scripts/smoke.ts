import { ASSETS, marketPhase, PHASE_LABEL } from '../lib/assets'
import { generateCandles, MarketEngine, generateTrades } from '../lib/sim'
import { invertSeries } from '../lib/inversion'
import { usdAbbr, pct, price, rate } from '../lib/format'

async function main() {
console.log('assets:', ASSETS.length, '| phase:', PHASE_LABEL[marketPhase()])
const a = ASSETS.find(x => x.symbol === 'TSLA')!
const c = generateCandles(a, '5m', 300, 1757500000)
console.log('candles:', c.length, 'lastClose=', c.at(-1)!.close.toFixed(2), 'assetPrice=', a.price)
const bad = c.filter(x => !(x.high >= Math.max(x.open,x.close) && x.low <= Math.min(x.open,x.close) && x.low > 0 && Number.isFinite(x.close)))
console.log('invalid candles:', bad.length)
const inv = invertSeries(c, 'reciprocal')
const badInv = inv.filter(x => !(x.high >= Math.max(x.open,x.close) - 1e-9 && x.low <= Math.min(x.open,x.close) + 1e-9 && x.low > 0))
console.log('invalid inverted candles:', badInv.length)
const c2 = generateCandles(a, '5m', 300, 1757500000)
console.log('deterministic:', JSON.stringify(c) === JSON.stringify(c2))
console.log('sample row:', a.symbol, price(a.price), pct(a.change24h), usdAbbr(a.volume24h), usdAbbr(a.liquidity), 'borrow', rate(a.borrowFee))
console.log('trades:', generateTrades(a, 20, 1757500000).length)
const eng = new MarketEngine(ASSETS, '1m', 50)
let ticks = 0
eng.subscribe('TSLA', () => ticks++)
eng.prime('TSLA', c.at(-1)!)
eng.start(); await new Promise(r => setTimeout(r, 400)); eng.stop()
console.log('engine ticks received:', ticks, '| price moved:', eng.snapshot('TSLA')!.price.toFixed(2))
const spread = ASSETS.map(x=>x.borrowFee)
console.log('borrow range:', rate(Math.min(...spread)), '->', rate(Math.max(...spread)))
console.log('private names:', ASSETS.filter(x=>x.private).map(x=>x.symbol).join(', '))

}
main()
