import { assetFromChain } from '../lib/imported'
import { price, usdAbbr } from '../lib/format'

// Supplies span an enormous range on this chain: 1e9 for a normal token,
// 1e15 for a "one quadrillion" memecoin.
const cases = [
  { address: '0x0339f5459fc690ac85f1782e15782a151b4a9e1b', symbol: 'WALLET', name: 'Robinhood Wallet', decimals: 18, supply: 1e9 },
  { address: '0x39dbed3a2bd333467115de45665cc57f813c4571', symbol: 'PONS', name: 'Pons', decimals: 18, supply: 1e9 },
  { address: '0x1111111111111111111111111111111111111111', symbol: 'BIG', name: 'Big Supply', decimals: 18, supply: 1e15 },
  { address: '0x2222222222222222222222222222222222222222', symbol: 'HUGE', name: 'Huge Supply', decimals: 18, supply: 1e18 },
  { address: '0x3333333333333333333333333333333333333333', symbol: 'ZERO', name: 'Zero Supply', decimals: 18, supply: 0 },
  { address: '0x4444444444444444444444444444444444444444', symbol: 'TINY', name: 'Tiny Supply', decimals: 18, supply: 1000 },
]
for (const c of cases) {
  const a = assetFromChain(c)
  console.log(
    c.symbol.padEnd(8),
    'supply', String(c.supply).padEnd(8),
    '| raw', a.price.toExponential(3).padEnd(12),
    '| price()', price(a.price).padEnd(16),
    '| mcap', usdAbbr(a.marketCap),
  )
}
