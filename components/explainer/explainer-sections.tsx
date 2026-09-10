import type { ReactNode } from 'react'
import { SHORT_CENSUS } from '@/lib/assets'
import { volatilityDrag } from '@/lib/inversion'
import { Pill } from '@/components/ui/primitives'

function Section({
  index,
  title,
  children,
}: {
  index: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="border-t border-line py-10">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="num text-mini text-ink-4">{index}</span>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      </div>
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink-2">{children}</div>
    </section>
  )
}

function Formula({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="rounded-[5px] border border-line bg-sunken px-4 py-3">
      <code className="num block text-sm text-ink">{children}</code>
      {note && <p className="mt-2 text-mini text-ink-4">{note}</p>}
    </div>
  )
}

export function Hero() {
  return (
    <header className="py-12">
      <Pill tone="short" className="mb-4">
        THE MECHANISM
      </Pill>
      <h1 className="max-w-[18ch] text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
        How you short a token that nobody will lend you.
      </h1>
      <p className="mt-5 max-w-[62ch] text-base leading-relaxed text-ink-2">
        Robinhood Chain carries {SHORT_CENSUS.total} tokenized equities.{' '}
        <span className="text-ink">{SHORT_CENSUS.none} of them</span> — {' '}
        {Math.round((SHORT_CENSUS.none / SHORT_CENSUS.total) * 100)}% of the chain — have no way to
        be sold short. No borrow market, no perpetual, no inverse product. SHORTCOIN builds the
        missing side of the trade out of the price series itself.
      </p>
    </header>
  )
}

export function WhyYouCannotShort() {
  return (
    <Section index="01" title="Why you cannot short a token today">
      <p>
        Selling short means selling something you do not own. That requires a lender: someone who
        holds the asset, is willing to part with it for a fee, and trusts you to give it back. In
        equities that machinery took decades to build. On-chain it barely exists.
      </p>
      <p>
        Spot venues are structurally long-only. A constant-product pool will happily sell you a
        token, but it cannot lend you one — there is no counterparty on the other side of the
        borrow, only inventory. So the only expression of a negative view available on a token
        exchange is not owning it, which is not a position.
      </p>
      <p>
        The usual answer is a perpetual future, and on this chain{' '}
        <span className="num text-ink">{SHORT_CENSUS.perp}</span> tokens have one somewhere. That
        leaves everything else. Five names have a lending market listed against them, and every one
        of those markets currently has nothing supplied — a borrow that does not clear is not a
        borrow.
      </p>
    </Section>
  )
}

export function TheInversion() {
  return (
    <Section index="02" title="The inversion">
      <p>
        If nobody will lend you the asset, stop trying to borrow it and build its mirror instead.
        Take the price series P and transform it into a series S that rises exactly when P falls.
        Buying S — an ordinary long position, the one thing every venue supports — is then
        economically a short of P. SHORTCOIN only ever does this: there is no long side to the
        product, and no leverage. Every chart you see is already the inverse.
      </p>
      <p>Three transforms do this, and they are not interchangeable.</p>

      <Formula note="The default. Never touches zero, never goes negative, loss capped at your stake, upside uncapped. A is the session anchor, so the inverse starts at the same price as the underlying.">
        reciprocal &nbsp; S = A² / P
      </Formula>

      <Formula note="Absolute PnL matches a classic short one-for-one. Its flaw is fatal above 2A, where the price would go negative — so it has to be re-anchored.">
        linear mirror &nbsp; S = 2A − P
      </Formula>

      <Formula note="What a −1x daily-rebalanced inverse ETF actually does. Path dependent, and it decays. Offered because it is honest, not because it is better.">
        compounded −1x &nbsp; Sₜ = Sₜ₋₁ · (1 − rₜ), &nbsp; rₜ = Pₜ/Pₜ₋₁ − 1
      </Formula>

      <p>
        The reciprocal earns its place through one property. On a logarithmic price axis it is an{' '}
        <span className="text-ink">exact</span> reflection, at every horizon, with no approximation
        and no path dependence:
      </p>

      <Formula note="Which is why every chart in SHORTCOIN defaults to a log scale. The flip is a true mirror, not something that merely looks like one.">
        ln S = 2·ln A − ln P &nbsp;&nbsp;⟹&nbsp;&nbsp; ln(S₁/S₀) = −ln(P₁/P₀)
      </Formula>

      <h3 className="pt-2 text-sm font-semibold text-ink">The high and the low swap</h3>
      <p>
        This is the detail almost everyone gets wrong. Every one of these transforms is strictly
        decreasing, so the largest input maps to the smallest output. When you invert a candle, the
        bar&apos;s high does not stay its high:
      </p>
      <Formula note="Open maps to open and close maps to close, but high and low cross over. Get this backwards and every candle you draw is malformed — the body will spill outside its own wicks.">
        sOpen = f(pOpen) &nbsp; sHigh = f(pLow) &nbsp; sLow = f(pHigh) &nbsp; sClose = f(pClose)
      </Formula>
      <p className="text-ink-3">
        The same logic applies to a two-sided quote: the best price to sell the inverse comes from
        the best price to buy the underlying, so bid and ask swap too.
      </p>
    </Section>
  )
}

const DRAG_ROWS = [0.2, 0.4, 0.6, 0.8, 1.0].map((sigma) => ({
  sigma,
  drag: volatilityDrag(-1, sigma, 1),
}))

export function WhatItCosts() {
  return (
    <Section index="03" title="What it costs">
      <p>
        Inverse exposure is not free, and the fee schedule is not where the cost hides. Hold a
        continuously rebalanced −1x product and its value is the reciprocal discounted by the
        variance it lived through:
      </p>
      <Formula note="Verified numerically: at σ = 40% over one year, theory gives exp(−0.16) = 0.8521 and a Monte Carlo simulation returns 0.8521.">
        S_T = S₀ · (P₀/P_T) · exp(−σ²T)
      </Formula>
      <p>
        That exp(−σ²T) is volatility drag. It is the price of the convexity you are being handed —
        the reason your losses are capped and your gains are not — and it accrues whether the
        underlying goes anywhere or not.
      </p>

      <div className="overflow-hidden rounded-[5px] border border-line">
        <table className="w-full border-collapse">
          <thead>
            <tr className="h-8 bg-sunken">
              <th className="border-b border-line px-3 text-left text-micro font-semibold uppercase tracking-[0.08em] text-ink-4">
                Annualised volatility
              </th>
              <th className="border-b border-line px-3 text-right text-micro font-semibold uppercase tracking-[0.08em] text-ink-4">
                Drag over one year
              </th>
              <th className="border-b border-line px-3 text-right text-micro font-semibold uppercase tracking-[0.08em] text-ink-4">
                Typical name
              </th>
            </tr>
          </thead>
          <tbody>
            {DRAG_ROWS.map((r, i) => (
              <tr key={r.sigma} className="h-9">
                <td className="num border-b border-line px-3 text-xs text-ink-2">
                  {(r.sigma * 100).toFixed(0)}%
                </td>
                <td className="num border-b border-line px-3 text-right text-xs text-short">
                  −{(Math.abs(r.drag) * 100).toFixed(1)}%
                </td>
                <td className="border-b border-line px-3 text-right text-xs text-ink-4">
                  {['A bond ETF', 'A large-cap equity', 'A high-beta name', 'A crypto treasury', 'A quantum stock'][i]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        On top of that sits the borrow fee for the name and the funding rate on the position. Where
        shorting is hardest, borrow is most expensive — which on this chain means the tokens nobody
        else can short at all are also the ones that cost the most to short here. The ticket shows
        both before you commit, and the terminal prices carry explicitly rather than quietly
        pocketing it.
      </p>
    </Section>
  )
}

export function LiquidationBackwards() {
  return (
    <Section index="04" title="Liquidation works the other way">
      <p>
        A long is liquidated when the price falls. A short is liquidated when the price{' '}
        <span className="text-ink">rises</span>. That inversion survives the transform, which means
        that on an inverted chart the liquidation level is a floor drawn below the current price,
        never a ceiling above it.
      </p>
      <Formula note="SHORTCOIN is unlevered, so L = 1 and liquidation sits just under twice the entry — the same level where the linear mirror would cross zero, which is not a coincidence. It is also why there is no leverage control anywhere in the product: a synthetic short is already convex, and stacking leverage on convexity is how people are carried out.">
        P_liq = entry · (1 + 1/L − mm) &nbsp;&nbsp;→&nbsp;&nbsp; S_liq = A² / P_liq
      </Formula>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[5px] border border-line bg-sunken p-4">
          <p className="mb-3 text-micro font-semibold uppercase tracking-[0.08em] text-ink-4">
            Underlying chart
          </p>
          <svg viewBox="0 0 200 90" className="w-full" role="img" aria-label="On the underlying chart the liquidation line sits above the price">
            <line x1="0" y1="24" x2="200" y2="24" stroke="var(--warn)" strokeWidth="1" strokeDasharray="3 3" />
            <text x="4" y="19" fill="var(--warn)" fontSize="7" fontFamily="var(--font-numeric)">LIQ</text>
            <path d="M4 58 L40 50 L76 66 L112 54 L148 62 L196 56" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" />
            <line x1="0" y1="56" x2="200" y2="56" stroke="var(--line-strong)" strokeWidth="1" />
            <text x="4" y="52" fill="var(--ink-3)" fontSize="7" fontFamily="var(--font-numeric)">MARK</text>
          </svg>
          <p className="mt-2 text-mini text-ink-3">Price rises into the line.</p>
        </div>

        <div className="rounded-[5px] border border-line bg-sunken p-4">
          <p className="mb-3 text-micro font-semibold uppercase tracking-[0.08em] text-ink-4">
            Inverted chart
          </p>
          <svg viewBox="0 0 200 90" className="w-full" role="img" aria-label="On the inverted chart the liquidation line sits below the price">
            <line x1="0" y1="34" x2="200" y2="34" stroke="var(--line-strong)" strokeWidth="1" />
            <text x="4" y="30" fill="var(--ink-3)" fontSize="7" fontFamily="var(--font-numeric)">MARK</text>
            <path d="M4 32 L40 40 L76 24 L112 36 L148 28 L196 34" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" />
            <line x1="0" y1="66" x2="200" y2="66" stroke="var(--warn)" strokeWidth="1" strokeDasharray="3 3" />
            <text x="4" y="76" fill="var(--warn)" fontSize="7" fontFamily="var(--font-numeric)">LIQ</text>
          </svg>
          <p className="mt-2 text-mini text-ink-3">Price falls into the line.</p>
        </div>
      </div>

      <p className="text-ink-3">
        Both diagrams describe the identical position at the identical moment. This is the single
        most dangerous thing an inverted chart can get wrong, which is why the terminal draws
        position overlays in whichever space is currently on screen rather than projecting them
        once and hoping.
      </p>
    </Section>
  )
}

export function Simulation() {
  return (
    <Section index="05" title="This is a simulation">
      <p>
        Every price, candle, fill, balance and holder in SHORTCOIN today is generated in your
        browser. No order reaches a venue. No wallet is connected. The account is credited with
        fake dollars and the positions you open cost nothing and are worth nothing.
      </p>
      <p>
        What is real is the identity data: the ticker symbols, the company names, the contract
        addresses read from the chain, and the count of how many of these tokens can actually be
        shorted somewhere today. The mathematics on this page is real too, and the transforms
        described here are the ones the product runs.
      </p>
      <p className="text-ink-3">
        None of this is investment advice, an offer, or a solicitation. Shorting carries unbounded
        risk in its classic form, and the capped-loss version described here achieves that cap by
        charging you for it.
      </p>
    </Section>
  )
}
