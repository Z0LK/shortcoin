# SHORTCOIN — working notes

Read `README.md` for what the product is, and `docs/STACK-NOTES.md` for verified API facts. Trust
that file over recollection: it was written by reading the installed packages, not from memory.

## Stack

Next.js 16 (App Router, no `src/`, Turbopack is the default — the `--turbopack` flag is obsolete) ·
React 19 · TypeScript 5.9 · Tailwind v4 · lightweight-charts 5 · zustand 5 · lucide-react · motion.

## Rules that are easy to break

- **Everything is fictional.** Never present simulated data as live. The honesty lines in the ticket
  and on `/how-it-works` are load-bearing, not boilerplate.
- **Short only, unlevered, always inverted.** There is no direction switch, no leverage control and
  no way to see the underlying series. Do not reintroduce any of the three.
- **Green is up, red is down.** On the inverse series that means a green candle is the underlying
  falling — the trade working. Never repaint the candles to match the trade's sign.
- **Every number gets `className="num"`** and goes through `lib/format.ts`. Never `toFixed` in a
  component: tabular figures are what stop digits jittering on every tick.
- **No `Math.random()` or `Date.now()` during render.** Derive fake values from `lib/rng.ts`; resolve
  wall-clock things inside `useEffect`. Both break hydration.
- `Math.log` and `Math.exp` are not bit-identical between Node and the browser. Anything computed
  with them that reaches the DOM must be rounded first — this already bit the SVG demo once.
- **Prices live outside React.** Ticks go straight from `MarketEngine` to the component that needs
  them via `useTickHandler`. Routing them through context would re-render the whole terminal.
- **Position maths runs on underlying prices, never inverted ones.** The inversion is a lens for the
  chart and the ticket; the book stays honest.
- `lib/assets.ts` is **generated**. Edit `scripts/registry.txt`, `scripts/coins.txt` or
  `scripts/pons-launches.txt`, then re-run `npx tsx scripts/gen-assets.ts`.
- **The coin tail is generated from an index, not stored.** `coinAt(n)` must stay a pure function of
  `n` — no clocks, no randomness outside `lib/rng.ts`, no I/O. The moment it stops being pure, the
  server and the client disagree about what token 41,203 is and every URL in the tail breaks.
- A coin's ticker encodes its index in base 36. Changing `symbolFor` invalidates every tail URL
  anyone has ever saved.
- Returns are drawn in log space so a token can rise 2000% and can never fall more than 100%.
  There is an assertion for this; do not "simplify" it back to a linear draw.

## Tailwind v4 traps

Default border colour is `currentColor` and buttons are `cursor: default` — both are pinned globally
in `app/globals.css`, so do not "fix" them locally. `outline-none` is now `outline-hidden`; the
important modifier goes last (`flex!`); `shadow`/`rounded`/`blur` all shifted one step down. There is
no `tailwind.config.js` and there should not be — tokens live in `@theme` inside `app/globals.css`.

## Before claiming something works

```bash
npm run typecheck && npm test && npm run build
```

`npm test` covers the inversion engine, including the log-mirror identity and the volatility-drag
closed form. If you touch `lib/inversion.ts`, those assertions are the contract.
