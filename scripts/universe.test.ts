import { coinAt, coinPage, resolveCoin, PONS_LAUNCH_TOTAL } from '../lib/universe'
import { getAsset } from '../lib/assets'
import { ageLabel, price, usdAbbr } from '../lib/format'

let fails = 0
const ok = (n: string, c: boolean, e = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : '')); if (!c) fails++ }

const a = coinAt(41203)
ok('deterministic across calls', JSON.stringify(coinAt(41203)) === JSON.stringify(a))
ok('symbol round-trips through resolve', resolveCoin(a.symbol)?.symbol === a.symbol, a.symbol)
ok('known coin still resolves', resolveCoin('CASHCAT')?.name === 'Cash Cat')
ok('garbage does not resolve', resolveCoin('NOTATOKEN') === undefined)
ok('a symbol that is not really ours is rejected', resolveCoin('ABC999999ZZ') === undefined)

// uniqueness across a big window
const page = coinPage(0, 20000)
const syms = new Set(page.map(c => c.symbol))
ok('20,000 consecutive coins have unique symbols', syms.size === 20000, `${syms.size}/20000`)
ok('no symbol collides with an equity', page.every(c => !getAsset(c.symbol) || getAsset(c.symbol)!.assetClass === 'coin'))

// age monotonic-ish and sensible
ok('index 0 is freshest', page[0].ageHours! < page[500].ageHours!, `${ageLabel(page[0].ageHours!)} vs ${ageLabel(page[500].ageHours!)}`)
ok('a day of launches is roughly a day back', Math.abs(coinAt(22581).ageHours! - 24) < 12, ageLabel(coinAt(22581).ageHours!))
ok('every coin has no short route', page.every(c => c.shortRoute === 'none'))
ok('prices are positive and finite', page.every(c => c.price > 0 && Number.isFinite(c.price)))
ok('market caps span a power law', Math.max(...page.slice(0,4000).map(c=>c.marketCap)) / Math.min(...page.slice(0,4000).map(c=>c.marketCap)) > 500)

const t0 = process.hrtime.bigint()
coinPage(1_000_000, 100)
const ms = Number(process.hrtime.bigint() - t0) / 1e6
ok('deep page is fast', ms < 60, `${ms.toFixed(1)}ms at index 1,000,000`)
ok('the far end of the universe still works', !!coinAt(PONS_LAUNCH_TOTAL - 1).symbol)

ok('no coin loses more than 100%', page.every(c => c.change24h > -100 && c.change1h > -100 && c.change7d > -100),
   `worst 24h ${Math.min(...page.map(c=>c.change24h)).toFixed(1)}%`)
ok('upside is uncapped', Math.max(...page.map(c => c.change24h)) > 200,
   `best 24h ${Math.max(...page.map(c=>c.change24h)).toFixed(0)}%`)

// live launches
const live = coinAt(-7)
ok('live launch has no minus sign in its ticker', !live.symbol.includes('-'), live.symbol)
ok('live launch resolves back', resolveCoin(live.symbol)?.symbol === live.symbol, live.symbol)
ok('live launch is seconds old', live.ageHours! * 3600 < 60, `${Math.round(live.ageHours! * 3600)}s`)
ok('live and historical indices do not collide',
   new Set([...Array(200).keys()].flatMap(i => [coinAt(i).symbol, coinAt(-1 - i).symbol])).size === 400)

console.log('\nsample feed:')
for (const c of coinPage(0, 6)) {
  console.log(`  ${c.symbol.padEnd(12)} ${c.name.padEnd(26)} ${ageLabel(c.ageHours!).padStart(5)}  ${usdAbbr(c.marketCap).padStart(8)} mcap  /${c.quote}  grad ${c.graduationPct}%`)
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
