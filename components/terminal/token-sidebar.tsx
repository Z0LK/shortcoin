'use client'

/**
 * The instrument rail.
 *
 * Identity first, then the things that decide whether a short is a good idea:
 * where it trades, how deep it is, what it costs to borrow, and — the detail
 * peculiar to tokenized equities — what happens to that cost when the venue
 * behind the token is shut.
 */

import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { ShortDesk } from '@/components/terminal/short-desk'
import { Label, Meter, Panel, Pill, Stat } from '@/components/ui/primitives'
import { useLivePrice } from '@/components/market-provider'
import {
  CHAIN,
  marketPhase,
  PHASE_LABEL,
  isStockPaired,
  SHORT_ROUTE_LABEL,
  tokenizationWindowOpen,
} from '@/lib/assets'
import { abbr, ageLabel, price as fmtPrice, shortAddress, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset, MarketPhase, ShortRoute } from '@/lib/types'

const ROUTE_TONE: Record<ShortRoute, 'long' | 'warn' | 'short'> = {
  borrow: 'long',
  perp: 'warn',
  none: 'short',
}

const ROUTE_NOTE: Record<ShortRoute, string> = {
  borrow:
    'A Morpho market lists this token as borrowable. In practice nothing is supplied to it, so the borrow does not clear.',
  perp: 'A perpetual future exists on another venue. There is still no way to short the spot token.',
  none: 'No borrow market, no perp, no inverse product. Nothing on this chain lets you be short this name.',
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => setCopied(true),
          () => setCopied(false),
        )
      }}
      aria-label={label}
      className="grid size-5 shrink-0 place-items-center rounded-[3px] text-ink-4 transition-colors hover:bg-raised hover:text-ink-2"
    >
      {copied ? <Check size={11} className="text-long" /> : <Copy size={11} />}
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
      <Label>{label}</Label>
      <span className="flex min-w-0 items-center gap-1">{children}</span>
    </div>
  )
}

export function TokenSidebar({ asset }: { asset: Asset }) {
  const live = useLivePrice(asset)

  const [phase, setPhase] = useState<MarketPhase | null>(null)
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null)
  useEffect(() => {
    const update = () => {
      setPhase(marketPhase())
      setWindowOpen(tokenizationWindowOpen())
    }
    update()
    const t = setInterval(update, 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex flex-col gap-px bg-line">
      {/* ── identity ───────────────────────────────────────────────────── */}
      <Panel bodyClassName="p-3">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="num grid size-9 shrink-0 place-items-center rounded-[5px] text-xs font-bold text-[#0a0c10]"
            style={{ background: `hsl(${asset.logoHue} 58% 60%)` }}
          >
            {asset.symbol.slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold">{asset.symbol}</h2>
              {asset.private && <Pill tone="info">PRIVATE COMPANY</Pill>}
              {asset.wholeSharesOnly && (
                <Pill tone="warn" title="The issuer has disabled fractional trading for this token.">
                  WHOLE SHARES
                </Pill>
              )}
            </div>
            <p className="truncate text-mini text-ink-3">{asset.name}</p>
            <p className="mt-1 truncate text-micro text-ink-4">{asset.tokenName}</p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          <Pill>{asset.sector}</Pill>
          {asset.underlying && !asset.private && <Pill>Underlying {asset.underlying}</Pill>}
          {asset.ageHours !== undefined && (
            <Pill tone={asset.ageHours < 336 ? 'warn' : 'neutral'}>
              {ageLabel(asset.ageHours)} old
            </Pill>
          )}
          {asset.launchpad && <Pill tone="info">Launched on {asset.launchpad}</Pill>}
          {asset.assetClass === 'coin' && (
            <Pill
              tone={isStockPaired(asset) ? 'info' : 'neutral'}
              title={
                isStockPaired(asset)
                  ? `Quoted against the ${asset.quote} stock token rather than money.`
                  : `Quoted against ${asset.quote}.`
              }
            >
              Paired /{asset.quote}
            </Pill>
          )}
          {asset.uiMultiplier !== 1 && (
            <Pill
              tone="info"
              title="ERC-8056 scaled-UI multiplier. Displayed balances are the raw balance times this number, which is how splits and corporate actions are applied without moving anyone's tokens."
            >
              ×{asset.uiMultiplier}
            </Pill>
          )}
        </div>
      </Panel>

      {/* ── short route ────────────────────────────────────────────────── */}
      <Panel title="Short route today" bodyClassName="p-3">
        <Pill tone={ROUTE_TONE[asset.shortRoute]} className="mb-2">
          {SHORT_ROUTE_LABEL[asset.shortRoute]}
        </Pill>
        <p className="text-mini leading-relaxed text-ink-3">{ROUTE_NOTE[asset.shortRoute]}</p>
        {asset.collateralOnly && (
          <p className="mt-2 text-mini leading-relaxed text-ink-4">
            Accepted as lending collateral, which buys you long leverage and nothing else.
          </p>
        )}
      </Panel>

      {/* ── contract ───────────────────────────────────────────────────── */}
      <Panel title="Contract">
        <Row label="Address">
          <span className="num text-mini text-ink-2">{shortAddress(asset.address, 6, 4)}</span>
          <CopyButton value={asset.address} label={`Copy the ${asset.symbol} contract address`} />
        </Row>
        <Row label="Chain">
          <span className="text-mini text-ink-2">{CHAIN.name}</span>
          <span className="num text-micro text-ink-4">#{CHAIN.chainId}</span>
        </Row>
        <Row label="Settlement">
          <span className="text-mini text-ink-2">{CHAIN.settlement}</span>
        </Row>
        <Row label="Verified">
          {asset.verifiedAddress ? (
            <Pill tone="long">READ ON-CHAIN</Pill>
          ) : (
            <Pill tone="warn" title="Placeholder address in this simulation.">
              SIMULATED
            </Pill>
          )}
        </Row>
        <div className="px-3 pb-2 pt-1">
          <a
            href={`${CHAIN.explorer}/address/${asset.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-mini text-info hover:underline"
          >
            View on explorer <ExternalLink size={10} />
          </a>
        </div>
      </Panel>

      {/* ── market ─────────────────────────────────────────────────────── */}
      <Panel title="Market">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 p-3">
          <Stat label="Price" value={fmtPrice(live.price)} />
          <Stat label="Market cap" value={usdAbbr(asset.marketCap)} />
          <Stat label="Liquidity" value={usdAbbr(asset.liquidity)} />
          <Stat label="24h volume" value={usdAbbr(asset.volume24h)} />
          <Stat label="Holders" value={abbr(asset.holders)} />
          <Stat label="Open interest" value={usdAbbr(asset.openInterest)} />
        </div>
      </Panel>

      <ShortDesk asset={asset} />

      {/* ── how it trades ──────────────────────────────────────────────── */}
      {asset.assetClass === 'coin' ? (
        <Panel title="How it trades" bodyClassName="p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="pulse-dot size-1.5 rounded-full bg-long" />
              <span className="text-mini font-medium text-ink-2">Always on</span>
            </span>
            <Pill title={`Liquidity sits in a DEX pool against ${asset.quote}.`}>
              Pool /{asset.quote}
            </Pill>
          </div>

          <p className="mt-2 text-mini leading-relaxed text-ink-3">
            Nothing anchors this token. There is no share behind it, no net asset value and no
            authorised participant — the price is whatever the pool says it is, every second of
            every day.
          </p>
          {isStockPaired(asset) && (
            <p className="mt-2 text-mini leading-relaxed text-ink-3">
              It is also a stock-paired meme: the pool is quoted in the {asset.quote} stock token
              rather than money, so shorting it is a bet on the coin <em>relative to</em>{' '}
              {asset.quote} — not against the dollar.
            </p>
          )}
          {asset.graduationPct !== undefined && asset.graduationPct < 100 && (
            <div className="mt-2.5">
              <div className="mb-1 flex items-baseline justify-between">
                <Label>Graduation</Label>
                <span className="num text-mini font-semibold text-ink-2">
                  {asset.graduationPct}%
                </span>
              </div>
              <Meter value={asset.graduationPct / 100} tone="warn" />
              <p className="mt-1.5 text-mini leading-relaxed text-ink-3">
                Still on {asset.launchpad}&apos;s bonding curve. Until it graduates there is no
                Uniswap pool behind the price — every buy walks the curve, and so does every exit.
              </p>
            </div>
          )}
          {asset.ageHours !== undefined && asset.ageHours < 336 && (
            <p className="mt-2 text-mini leading-relaxed text-warn">
              {ageLabel(asset.ageHours)} old. Borrow on a token this young is punitive precisely
              because nobody can price the risk of it going to zero overnight.
            </p>
          )}
        </Panel>
      ) : (
        <Panel title="Trading hours" bodyClassName="p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'size-1.5 rounded-full bg-current',
                  phase === 'open' && 'pulse-dot',
                  phase === 'open' ? 'text-long' : phase ? 'text-warn' : 'text-ink-4',
                )}
              />
              <span className="text-mini font-medium text-ink-2">
                {phase ? PHASE_LABEL[phase] : '—'}
              </span>
            </span>
            <Pill tone={windowOpen === false ? 'warn' : 'neutral'}>
              {windowOpen === false ? 'MINT WINDOW SHUT' : 'MINT WINDOW OPEN'}
            </Pill>
          </div>

          <p className="mt-2 text-mini leading-relaxed text-ink-3">
            The token trades on-chain 24/7. The share it tracks does not. Mint and burn only run
            Monday 02:00 CET through Saturday 02:00 CET, and outside that window no authorised
            participant can arbitrage the token back to the underlying.
          </p>
          <p className="mt-2 text-mini leading-relaxed text-ink-4">
            Borrow and funding keep accruing the whole time. A short held over a weekend pays for
            three days of carry against a price nothing is anchoring.
          </p>
        </Panel>
      )}

    </div>
  )
}
