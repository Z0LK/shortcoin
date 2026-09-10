# SHORTCOIN

A **short-only** trading terminal for **Robinhood Chain** — both the tokenized equities (AAPL, TSLA,
SPCX) and the chain's native coins (PONS, CASHCAT and the memecoins quoted against stock tokens).
Shorting is the one thing no other on-chain venue offers.

There is no long side and no leverage. Every chart in the product is already the synthetic inverse,
so a green candle means the stock fell and the trade is working.

Every spot token venue is structurally long-only. SHORTCOIN builds the missing side of the trade out
of the price series itself: it transforms a token's chart into a synthetic **inverse** instrument, so
buying the inverse is economically a short of the underlying.

> **Almost everything here is a simulation.** The one exception is token identity: paste a contract
> address and SHORTCOIN reads it straight off Robinhood Chain. See *Pasting an address*, below.
>
> **Everything else is a simulation.** Prices, candles, fills, balances and holders are generated in
> your browser. No order reaches a venue and no wallet is connected. What *is* real: the ticker
> symbols, company names, sector taxonomy, on-chain contract addresses, and the count of how many of
> these tokens can actually be shorted somewhere today.

---

## The wedge, in one number

Robinhood Chain carries **195** tokenized equities and **103** native coins.

| Short route available today | Tokens |
| --- | --- |
| Spot borrow market (all currently with nothing supplied) | 5 |
| Perpetual future on another venue | 39 |
| **Nothing at all** | **254** — 85% of the chain |

That last row is the product. Every single coin is in it: no memecoin on this chain has a perp, a
lending market or an inverse product, and borrow quotes run past 200% a year — not because the trade
is crowded, but because there is no instrument to be short with.

**The named coins are real.** 90 of them were pulled from the Pons launchpad's public API
(`ponsfamily.com/api/pons-launches`) — real symbols, names, contract addresses, market caps, quote
assets and graduation progress. The rest came from reporting on the chain's majors: PONS itself,
CASHCAT, Artificial Inu and the meme complex around them.

**The tail is infinite.** Pons has deployed **4,228,127** tokens and mints north of **22,581 a
day** — a fixed array cannot represent that, and a scanner that ends after a hundred rows is a list,
not a market. So `lib/universe.ts` generates coins from their index: pure, deterministic, and
identical on the server and the client. Coin 41,203 is the same coin on every device, forever, and
nothing is stored or fetched to make that true.

Index 0 is the newest launch and age grows with index at the launchpad's real mint rate, so
scrolling the feed walks backwards through time. Negative indices are launches that land while you
watch: the **New launches** tab pushes one onto the front roughly every four seconds, ages count up
in seconds, and it pauses when the tab is hidden.

A ticker carries its own index in base 36, so `/t/CINDX7` regenerates its token without a lookup
table of four million rows — and the ambiguity between the stem and the index is resolved by trying
every split and keeping the one that round-trips.

**Two asset classes, two sets of rules.** Equities track a share, so they inherit its calendar and
the Monday–Saturday mint window that keeps the token pegged. Coins track nothing and trade genuinely
around the clock — and some of them, the *stock-paired memes* the chain invented, are quoted against
a tokenized equity rather than a stablecoin, so shorting them is a bet relative to NVDA or SPY.

---

## The inversion

The product ships **one** transform: `S = A² / P`. Any strictly decreasing map would invert a
series — and **the high and the low swap** when a candle goes through one, `sHigh = f(pLow)` — but
only the reciprocal is safe behind a one-click short. The linear mirror `S = 2A − P` prints a
negative price above `2A`; the compounded −1x is path dependent. `/how-it-works` compares all three,
because the comparison is the argument for the one that shipped.

The reciprocal wins because on a **logarithmic** axis it is an exact reflection at every horizon,
with no path dependence:

```
ln S = 2·ln A − ln P    ⟹    ln(S₁/S₀) = −ln(P₁/P₀)
```

Which is why every chart is on a log scale: what you are looking at is a true reflection of the
stock, not something that merely resembles one.

**Carry is charged, not hidden.** A continuously rebalanced −1x is worth the reciprocal times
`exp(−σ²T)`. On a 40%-vol name that is roughly 16% a year of volatility drag on top of borrow and
funding, and the interface says so.

**Liquidation runs the other way.** A short is liquidated when the underlying *rises*, so on the
inverted chart the liquidation line is a floor below the price, never a ceiling. Unlevered, it sits
just under twice the entry.

---

## Running it

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 (Turbopack) |
| `npm run build` | Production build — prerenders all 195 terminals |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 61 assertions: inversion engine, search ranking, coin universe |
| `npm run smoke` | End-to-end check of assets, simulator and inversion |

---

## Screens

| Route | What it is |
| --- | --- |
| `/` | Scanner — stocks, coins, and an endless live launch feed |
| `/t/[symbol]` | Terminal — chart, order ticket, book, instrument rail |
| `/portfolio` | Open shorts, exposure by sector, equity curve |
| `/how-it-works` | The mechanism, with an interactive inversion demo |

**⌘K** opens the command palette. Positions are unlevered, so the collateral you post is the
notional you sell, and liquidation sits just under twice the entry.

**Charts are denominated in market cap by default.** Supply is fixed on these tokens, so cap is
price times a constant and the two units are interchangeable — but one of them is legible. A
memecoin at `0.0₉2` renders as `0.00` in every axis label a charting library will give you; the
same token at `$202.99K` does not. An MC / PRICE switch sits next to the interval strip and governs
the chart, the scanner's live column and the search results together.

---

## Layout

```
app/                     routes (App Router, no src/)
components/
  chart/                 lightweight-charts wrapper + instrument header
  scanner/               the discover table
  terminal/              ticket, activity panel, instrument rail, short desk
  portfolio/             exposure, equity curve
  explainer/             the interactive inversion demo
  shell/                 nav, tape, command palette, brand
  ui/primitives.tsx      Panel, Pill, Meter, Stat, Button, Label
lib/
  inversion.ts           the maths engine — unit tested
  sim.ts                 fake market: candle generation + tick loop
  assets.ts              GENERATED by scripts/gen-assets.ts, do not edit
  store.ts               zustand: wallet, book, transform choice (persisted)
  chain.ts               the one real network call: read an ERC-20 off Robinhood Chain
  imported.ts            an on-chain identity plus a simulated market around it
  universe.ts            the infinite coin tail — generated from an index
  search.ts              ranked symbol / name / address matching
  format.ts              every number in the product goes through here
docs/STACK-NOTES.md      verified API facts — trust this over memory
```

`lib/assets.ts` is generated from three registries — `scripts/registry.txt` (tokenized equities),
`scripts/coins.txt` (the chain's major coins) and `scripts/pons-launches.txt` (the launchpad long
tail). Edit those or `scripts/gen-assets.ts`, then re-run `npx tsx scripts/gen-assets.ts`.

### Pasting an address

The chain has millions of contracts and this app ships a few hundred names, so "not in my list" is
the wrong answer to a pasted address. Paste one and it is read off the chain for real, server-side:

```
lib/chain.ts          eth_getCode + symbol() / name() / decimals() / totalSupply()
app/api/token         Route Handler, so the RPC stays off the client and CORS never enters into it
lib/imported.ts       turns the chain read into something the terminal can quote
```

`/t/0x39dbed3a2bd333467115de45665cc57f813c4571` opens the real Pons token. What came off the chain
— symbol, name, decimals, supply — is true. Everything the simulation adds on top of it (price,
depth, holders, borrow) is not, and the instrument rail says so with a **READ FROM CHAIN** badge
next to a **SIMULATED MARKET** one.

**Search** is ranked, not filtered (`lib/search.ts`). It has to be: there is a token called
`TSLAMEME` quoted against `TSLA`, and an `APPLS` whose name is "Apple Stock". Exact ticker wins,
then exact contract address, then ticker prefix, then name prefix, then substrings, then address
prefix — ties broken by liquidity. Pasting a `0x…` address resolves straight to the token.

---

## Going real

The data layer sits behind one module (`lib/sim.ts`), so swapping the simulator for a feed touches
nothing else.

On **Lighter** — evaluated and rejected for the frontend. `elliottech/lighter-python` is not pure
Python: it ships 8–18 MB Go-cgo signer binaries loaded through ctypes. The official TypeScript
package `zklighter-perps` ships uncompiled sources and **no signer at all**. Its public REST/WS
market data needs no SDK and is genuinely pleasant from TypeScript; order signing would need a
`lighter-go` sidecar. Full findings in `docs/STACK-NOTES.md`.
