# SHORTCOIN — verified stack facts

Verified directly against installed node_modules on 2026-09-10. Do not trust memory over this file.

## Versions (installed, working)
next 16.3.4 · react 19.2.8 · react-dom 19.2.8 · typescript 5
tailwindcss 4 (+ @tailwindcss/postcss) — CSS-first config, no tailwind.config.js
lightweight-charts 5.2.1 · zustand 5.0.15 · lucide-react 1.44.0 · motion 13.2.0
@tanstack/react-virtual 3.14.11 · clsx 2.1.1 · tailwind-merge 3.6.0

## lightweight-charts v5 — API ground truth
v5 REMOVED `chart.addCandlestickSeries()`. Use the series-definition form:

```ts
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, BaselineSeries, BarSeries,
  createSeriesMarkers, createTextWatermark,
} from 'lightweight-charts'

const chart = createChart(el, { /* DeepPartial<ChartOptions> */ })
const candles = chart.addSeries(CandlestickSeries, { upColor, downColor, borderVisible: false, wickUpColor, wickDownColor })
const volume  = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' })
candles.setData(data)        // full replace
candles.update(lastBar)      // realtime tick (same or next timestamp)
```

- Markers are a plugin in v5: `createSeriesMarkers(series, markers)` — NOT `series.setMarkers()`.
- Price scale flip is native: `chart.priceScale('right').applyOptions({ invertScale: true })`
  Docs: "Invert the price scale, so that an upwards trend is shown as a downwards trend and vice versa. Affects both the price scale and the data on the chart."
  IMPORTANT: `invertScale` only mirrors the RENDERING. Price labels, crosshair values and our order ticket must run on genuinely transformed values, so SHORTCOIN computes a real inverse series in `lib/inversion.ts` and does not rely on invertScale for numbers.
- Other useful price-scale options: `autoScale`, `scaleMargins: {top, bottom}`, `borderVisible`, `mode: PriceScaleMode`.
- `chart.addSeries(def, options, paneIndex)` supports multi-pane (volume in pane 1).

## Next.js 16 notes
- App Router, no src/ dir, import alias `@/*`.
- Anything touching `createChart`, `window`, or the tick simulator must be a `"use client"` component.
- Turbopack dev is the default (`next dev`).

## Tailwind v4 notes
- No `tailwind.config.js`. Tokens are declared in CSS via `@theme { --color-*: ...; --font-*: ...; }`.
- `@import "tailwindcss";` at the top of app/globals.css.
- A token `--color-foo: #123` generates `bg-foo`, `text-foo`, `border-foo` utilities automatically.

## Lighter — researched verdict (answers "should we use lighter-python?")

**Short answer: not for this frontend.** Findings, verified against the actual published artifacts:

- `elliottech/lighter-python` is **not pure Python**. `lighter/signers/` ships prebuilt Go-cgo binaries
  (`lighter-signer-windows-amd64.dll` 18.3 MB, `-linux-amd64.so` 11.7 MB, `-darwin-arm64.dylib` 8.7 MB…)
  loaded through ctypes. ZK transaction signing is native code — it cannot be ported to TypeScript.
- There IS an official TS package, `zklighter-perps` (npm, author elliottech). It ships 357 raw
  uncompiled `.ts` files with `"main": "index.ts"`, no `types`, no build output — and **no signer of
  any kind**. It can read everything and sign nothing.
- Lighter's **public REST/WS needs no SDK**: base `https://mainnet.zklighter.elliot.ai`, no top-level
  auth on market data. Useful endpoints: `/api/v1/candles` (1m…1d, ≤500 bars), `/markPriceCandles`,
  `/recentTrades`, `/orderBooks`, `/orderBookDetails` (per-market decimals — needed for formatting),
  `/funding-rates`, `/liquidations`, a TradingView UDF datafeed at `/api/v1/tv/history`, and
  `wss://mainnet.zklighter.elliot.ai/stream`.
- Lighter is an **order-book perps DEX**, not a token/AMM venue. It lists fixed markets by integer
  `market_id`. It notably now runs **24/5 equity perps**, which is adjacent to what SHORTCOIN trades.

**Plan of record.** Keep the data layer behind one adapter (`lib/sim.ts` today). For real reads later,
hand-write a few `fetch` calls against Lighter's REST or generate a client from their `openapi.json` —
do not depend on `zklighter-perps` as published. If real order placement is ever needed, run
`elliottech/lighter-go` as an HTTP sidecar (single static binary) behind a Next Route Handler; never
put a signer in the browser. Hyperliquid is the lower-friction alternative for a TS-only team — it has
an official TypeScript SDK and 40+ equity perps.

## Windows / Next 16 operational notes
- Turbopack is the DEFAULT in Next 16 for both `dev` and `build` — the `--turbopack` flag is obsolete.
- If any dependency injects a webpack config, `next build` hard-fails; escape hatch is `next build --webpack`.
- Add the project dir and `node_modules` to Microsoft Defender exclusions — antivirus file access is a
  documented top cause of slow compiles on Windows.
- The project is NOT under OneDrive, which is the biggest known Turbopack-on-Windows hazard. Keep it that way.
- `next lint` is removed in 16; `next build` no longer lints.
- `params` / `searchParams` / `cookies()` / `headers()` are async-only now — the v15 sync shim is gone.

## Tailwind v4 traps that specifically bite a dark terminal
1. Default border colour is `currentColor` → pinned globally in `app/globals.css`.
2. Preflight sets `button { cursor: default }` → re-enabled globally in `app/globals.css`.
3. `shadow`/`rounded`/`blur` all shifted one step down (old `shadow` → `shadow-sm`).
4. `outline-none` is now `outline-hidden`; `ring` defaults to 1px in `currentColor`.
5. Important modifier moved to the end: `!flex` → `flex!`. Variant order reversed: `*:first:pt-0`.
6. Custom utilities need `@utility name {}`, not `@layer utilities`.
