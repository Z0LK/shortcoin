# SHORTCOIN — working notes

Read `SPEC-FRONTEND.md` first: it defines the product, the vocabulary and the data contracts, and it
wins over anything here. Then `README.md` for the architecture, `docs/OPEN-QUESTIONS.md` for what is
undecided, and `docs/STACK-NOTES.md` for verified library facts.

## Stack

Next.js 16 (App Router, no `src/`, Turbopack by default) · React 19 · TypeScript 5.9 targeting
ES2020 (bigint literals) · Tailwind v4 · lightweight-charts 5 · zustand 5 · lucide-react.

## Rules that are easy to break

- **Screens talk to a `ProtocolAdapter`, never to `PaperAdapter`.** Use the hooks in
  `components/protocol/provider.tsx`. The only paper-specific thing a screen may touch is
  `useRuntime().paper`, and only for dev levers that are hidden outside paper mode.
- **The front never computes the entry price, the premium or the capacity.** It shows the quote.
  `lib/protocol/payoff.ts` draws graphs and cross-checks quotes in dev; it decides nothing.
- **Never hard-code the tranche.** Read `capPct` / `barrierPct` from the quote. `FIRST_TRANCHE` is
  for explanatory copy and paper defaults only.
- **Money is bigint, end to end.** USDG is 6 decimals, prices are 1e18 fixed-point strings. Convert
  to `number` only to draw a pixel — `fixedToNumber` and `usdgToNumber` say "display only" for a
  reason.
- **Every price goes through `formatMicroPrice`**, including chart axes. `0.000000042` renders as
  `0.0₇42`.
- **Two price marks on every position.** Settlement price first, spot second and greyed, with the
  tooltip. Never the spot alone on a position screen (§5).
- **Vocabulary (§2).** Position short, collatéral, notionnel, prix d'entrée, barrière, plafond de gain,
  knock-out, premium quotidien, capacité, prix de règlement, TWAP. Never: emprunter, vendre, vente à
  découvert, liquider, marge, appel de marge, levier (unqualified), garanti, sans risque — the only
  exception is explaining what the product is *not*, as the spec's own copy does.
- **Every user-facing string goes through `t()`**, in both `lib/i18n/fr.ts` and `lib/i18n/en.ts`.
  The type checker enforces that English has every French key.
- **Buttons say what happens.** « Ouvrir la position », never « Confirmer », and the same label until
  the confirmation toast.
- **No `Math.random()` or `Date.now()` during render.** Derive fake values from `lib/rng.ts`; read the
  clock in effects. Both break hydration.
- **One price series per token** (`lib/protocol/series.ts`). The list, the chart overlay, the marks
  and the receipts all read it, so they never disagree. Do not generate a second one for a screen.
- `lib/assets.ts` is **generated** — edit the registries in `scripts/` and re-run
  `npx tsx scripts/gen-assets.ts`.
- **The coin tail is generated from an index.** `coinAt(n)` must stay pure, and a coin's ticker
  encodes its index in base 36 — changing `symbolFor` breaks every saved tail URL.

## Tailwind v4 traps

Default border colour is `currentColor` and buttons are `cursor: default` — both pinned globally in
`app/globals.css`. `outline-none` is `outline-hidden`; the important modifier goes last (`flex!`).
No `tailwind.config.js` — tokens live in `@theme` in `app/globals.css`.

## Before claiming something works

```bash
npm run typecheck && npm test && npm run build
```

`scripts/protocol.test.ts` runs the paper adapter's whole lifecycle — quote, open, knock-out,
receipt, early close, HLP lockup, search states. If you touch `lib/protocol/`, those assertions are
the contract.
