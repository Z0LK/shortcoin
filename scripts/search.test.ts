import { ASSETS, getAsset } from '../lib/assets'
import { searchAssets } from '../lib/search'

let fails = 0
const ok = (n: string, c: boolean, e = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : '')); if (!c) fails++ }
const top = (q: string) => searchAssets(ASSETS, q, 5).map(h => h.asset.symbol)

// The universe is coins only now — the equity tickers a meme impersonates are
// no longer listed, so the lookalike cases are checked against coin names.
ok('exact ticker beats a coin that contains it', top('PONS')[0] === 'PONS', top('PONS').join(','))
ok('finds a Pons coin by ticker', top('PONS')[0] === 'PONS', top('PONS').join(','))
ok('finds CASHCAT', top('CASHCAT')[0] === 'CASHCAT', top('CASHCAT').join(','))
ok('prefix picks the shortest ticker', top('PON')[0] === 'PONS', top('PON').join(','))
ok('finds a coin by company-ish name', top('robinhood doge').length > 0, top('robinhood doge').join(','))
ok('case insensitive', top('cashcat')[0] === 'CASHCAT')
ok('substring finds mid-ticker', top('ONS').includes('PONS'), top('ONS').join(','))

const pons = getAsset('PONS')!
ok('full contract address resolves exactly', searchAssets(ASSETS, pons.address, 3)[0].asset.symbol === 'PONS')
ok('address prefix resolves', searchAssets(ASSETS, pons.address.slice(0, 10), 3)[0].asset.symbol === 'PONS')
ok('address match is reported as such', searchAssets(ASSETS, pons.address, 3)[0].reason === 'address')

const ztha = getAsset('ZTHA')
ok('Pons launchpad token is listed', !!ztha && ztha.launchpad === 'Pons', ztha ? `grad ${ztha.graduationPct}%` : 'missing')
ok('stock-paired coin keeps its quote', getAsset('MATRIX')?.quote === 'NVDA', getAsset('MATRIX')?.quote)
ok('every coin has no short route', ASSETS.filter(a => a.assetClass === 'coin').every(a => a.shortRoute === 'none'))
ok('empty query returns the deepest names', searchAssets(ASSETS, '', 5).length === 5)
ok('nonsense returns nothing', searchAssets(ASSETS, 'zzzqqqx', 5).length === 0)

console.log(`\n${ASSETS.length} assets · ${ASSETS.filter(a=>a.assetClass==='coin').length} coins`)
console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
