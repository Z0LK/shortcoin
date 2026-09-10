import {
  invertSeries, invertPrice, revertPrice, unrealizedPnl, liquidationPrice, compoundDecay,
  invertPriceLeveraged, volatilityDrag, fairInversePrice, invertedLiquidation, invertQuote,
} from '../lib/inversion'
import type { Candle } from '../lib/types'

const P: Candle[] = [
  { time: 1, open: 100, high: 110, low: 95,  close: 105, volume: 10 },
  { time: 2, open: 105, high: 120, low: 100, close: 118, volume: 12 },
  { time: 3, open: 118, high: 125, low: 90,  close: 92,  volume: 30 },
]
let fails = 0
const ok = (n: string, c: boolean, e = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : '')); if (!c) fails++ }
const near = (a: number, b: number, t = 1e-9) => Math.abs(a - b) < t

const R = invertSeries(P, 'reciprocal')
ok('reciprocal anchored at A', near(R[0].open, 100))
ok('OHLC swap: sHigh=f(pLow), sLow=f(pHigh)', near(R[0].high, 100*100/95) && near(R[0].low, 100*100/110))
ok('bar validity invariant', R.every(c => c.high >= Math.max(c.open,c.close)-1e-9 && Math.min(c.open,c.close) >= c.low-1e-9))
ok('direction invariant (pClose>pOpen) === (sClose<sOpen)', P.every((p,i) => (p.close > p.open) === (R[i].close < R[i].open)))
ok('LOG-MIRROR IDENTITY ln(S1/S0) === -ln(P1/P0)',
   near(Math.log(R[2].close/R[0].open), -Math.log(P[2].close/P[0].open), 1e-12),
   `lnS=${Math.log(R[2].close/R[0].open).toFixed(9)} -lnP=${(-Math.log(P[2].close/P[0].open)).toFixed(9)}`)
ok('reciprocal === log-mirror A^2/P (same function)', near(invertPrice(137, 100), 100*100/137))
ok('always strictly positive', R.every(c => c.low > 0))

const M = invertSeries(P, 'mirror')
ok('mirror exact 1x short payoff', near((M[2].close - M[0].open), -(P[2].close - P[0].open)))
ok('mirror bar validity', M.every(c => c.high >= Math.max(c.open,c.close)-1e-9 && Math.min(c.open,c.close) >= c.low-1e-9))

const C = invertSeries(P, 'compound')
ok('compound bar validity', C.every(c => c.high >= Math.max(c.open,c.close)-1e-9 && Math.min(c.open,c.close) >= c.low-1e-9))
ok('compound === S_prev*(2 - P/Pprev)', near(C[1].close, C[0].close * (2 - P[1].close / P[0].close)),
   `got=${C[1].close.toFixed(6)} exp=${(C[0].close*(2-P[1].close/P[0].close)).toFixed(6)}`)
ok('compound decays on whipsaw', compoundDecay(P) < 0, `${(compoundDecay(P)*100).toFixed(2)}%`)

ok('round trip reciprocal', near(revertPrice(invertPrice(137.42, 100), 100), 137.42))
ok('round trip mirror', near(revertPrice(invertPrice(137.42, 100, 'mirror'), 100, 'mirror'), 137.42))

ok('leveraged lam=1 === reciprocal', near(invertPriceLeveraged(137, 100, 1), invertPrice(137, 100)))
const elasticity = (Math.log(invertPriceLeveraged(101,100,2)) - Math.log(invertPriceLeveraged(100,100,2))) / (Math.log(101)-Math.log(100))
ok('leveraged elasticity dlnS/dlnP = -lam (lam=2)', near(elasticity, -2, 1e-9), `e=${elasticity.toFixed(9)}`)

ok('drag L=-1 is -sigma^2 T', near(volatilityDrag(-1, 0.4, 1), -0.16))
ok('drag L=-2 is -3 sigma^2 T', near(volatilityDrag(-2, 0.4, 1), -3*0.16))
ok('drag L=-3 is -6 sigma^2 T', near(volatilityDrag(-3, 0.4, 1), -6*0.16))
ok('fair price = reciprocal * exp(-sigma^2 T) matches theory 0.8521',
   near(fairInversePrice(100, 100, 0.40, 1) / 100, Math.exp(-0.16), 1e-12),
   `ratio=${(fairInversePrice(100,100,0.40,1)/100).toFixed(4)}`)

ok('short pnl positive when price falls', unrealizedPnl('short', 100, 92, 10) === 80)
const liq = liquidationPrice('short', 100, 5, 0.005)
ok('short liq above entry (entry-notional convention)', near(liq, 100*(1+1/5-0.005)), `liq=${liq}`)
ok('lev=1, mmr=0 => liq at 2x entry (mirror zero-crossing)', near(liquidationPrice('short', 100, 1, 0), 200))
const sLiq = invertedLiquidation(liq, 100)
ok('LIQ IS A FLOOR IN INVERTED SPACE (below current)', sLiq < invertPrice(100, 100),
   `S_liq=${sLiq.toFixed(2)} < S_now=${invertPrice(100,100).toFixed(2)}`)

const q = invertQuote(99, 101, 100)
ok('quote sides swap on inversion', near(q.bid, 100*100/101) && near(q.ask, 100*100/99) && q.bid < q.ask,
   `bid=${q.bid.toFixed(4)} ask=${q.ask.toFixed(4)}`)

console.log(fails === 0 ? `\nALL ${'PASS'} (${24 - fails} checks)` : `\n${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
