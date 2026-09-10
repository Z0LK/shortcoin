'use client'

/**
 * The short desk.
 *
 * A memecoin terminal shows you rug checks. SHORTCOIN shows you whether a name
 * is worth being short of — which is a different question from whether it is
 * going down. Everything here is derived from the asset's own fields, so the
 * verdict is stable per symbol and never invents data.
 */

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Label, Meter, Panel, Pill } from '@/components/ui/primitives'
import { borrowOver } from '@/lib/inversion'
import { clamp01, pct, rate, signedRate, usd, usdAbbr } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Asset } from '@/lib/types'

/** Funding is quoted per 8h, so a year holds three payments a day. */
const FUNDING_PERIODS_YEAR = 3 * 365

/** The size every plain-English cost example is quoted on. */
const EXAMPLE_NOTIONAL = 10_000

type Grade = { label: string; tone: 'accent' | 'warn'; verdict: string }

interface Scorecard {
  score: number
  grade: Grade
  momentum: number
  fundingAnnual: number
  crowding: number
  borrow: number
  carry: number
  strength: number
  depth: number
  squeeze: number
}

/**
 * A short is not good because the chart is falling. It is good when the cost of
 * being wrong is low — a falling name you cannot afford to hold is a worse trade
 * than a flat one you can sit on for a quarter.
 *
 * Five costs, each normalised 0..1 against the level where a desk starts
 * refusing the trade, then subtracted from 100:
 *
 *   crowding  short interest. The more of the open interest already short, the
 *             less borrow is left and the more fuel a squeeze has to burn.
 *   borrow    annual rent on the position. Past ~60%/yr the thesis has to be
 *             right in weeks, which is a timing bet wearing a valuation costume.
 *   carry     funding. Positive funding pays the short and offsets the rent;
 *             negative funding means renting the same trade twice.
 *   strength  momentum. Selling something that is going up is a timing bet.
 *   depth     liquidity. Thin books cost you on the exit, and the exit is the
 *             one moment a short cannot afford to be patient.
 *
 * The sixth term is the only interaction worth modelling: crowding × strength.
 * Crowded shorts do not break on a calm tape — they break when a crowded book
 * meets an upward move and every cover order is itself a buy.
 */
export function shortScore(a: Asset): Scorecard {
  const fundingAnnual = a.fundingRate * FUNDING_PERIODS_YEAR
  const momentum = a.change24h * 0.65 + a.change7d * 0.35

  const crowding = clamp01(a.shortInterest / 0.65)
  const borrow = clamp01(a.borrowFee / 0.6)
  // 0.5 is neutral carry; being paid to hold the short pulls the cost below it.
  const carry = clamp01(0.5 - fundingAnnual / 1.2)
  const strength = clamp01(0.5 + momentum / 16)
  const depth = clamp01(1 - a.liquidity / 40e6)
  const squeeze = crowding * strength

  const cost =
    0.24 * crowding + 0.2 * borrow + 0.14 * carry + 0.24 * strength + 0.08 * depth + 0.1 * squeeze

  const score = Math.round(100 * (1 - clamp01(cost)))

  const parts = { momentum, fundingAnnual, crowding, borrow, carry, strength, depth, squeeze }
  return { score, grade: gradeFor(score, parts), ...parts }
}

/**
 * The label has to name the actual problem, not just how bad the number is.
 *
 * A crowded equity short and an unlendable memecoin can score identically and
 * mean opposite things: one is expensive because everybody is already short,
 * the other because nobody will lend it at any price. Calling the second
 * "crowded" tells the user something false about who is on the other side.
 */
function gradeFor(
  score: number,
  p: { crowding: number; borrow: number; strength: number; depth: number },
): Grade {
  if (score >= 70)
    return {
      label: 'Clean',
      tone: 'accent',
      verdict:
        'Cheap to borrow, uncrowded and losing altitude. You can be early without being punished for waiting.',
    }
  if (score >= 55)
    return {
      label: 'Workable',
      tone: 'accent',
      verdict:
        'Nothing disqualifying, but the carry is real. Size it so the funding bill never forces the exit.',
    }

  const crowded = p.crowding > 0.42
  const rising = p.strength > 0.62

  if (crowded && rising)
    return {
      label: 'Squeeze risk',
      tone: 'warn',
      verdict:
        'A crowded book meeting an upward move. Every cover order above you is itself a buy, which is how the move feeds on the people trying to leave it.',
    }

  if (crowded)
    return {
      label: 'Crowded',
      tone: 'warn',
      verdict:
        'The trade is well known and the rent is high. Everyone here already agrees with you, which is the problem.',
    }

  // High cost with an empty short side is a supply problem, not a consensus
  // one — the signature of almost every coin on this chain.
  if (p.borrow > 0.75)
    return {
      label: 'No lender',
      tone: 'warn',
      verdict:
        'Barely anyone is short, and it still costs a fortune to borrow. That is not consensus against you, it is an absent supply of stock — you are paying for scarcity, and the rent compounds while you wait to be right.',
    }

  if (rising)
    return {
      label: 'Fighting the tape',
      tone: 'warn',
      verdict:
        'Uncrowded and affordable, but going the wrong way. Selling something that is rising is a bet on timing rather than on value.',
    }

  if (p.depth > 0.85)
    return {
      label: 'Thin',
      tone: 'warn',
      verdict:
        'The book is too shallow to leave quickly. Entry is never the problem on a name like this; the exit is.',
    }

  return {
    label: 'Expensive',
    tone: 'warn',
    verdict:
      'Nothing here is disqualifying on its own, but the costs stack. The thesis has to work on a schedule.',
  }
}

export function ShortDesk({ asset }: { asset: Asset }) {
  const s = shortScore(asset)
  const squeezing = asset.shortInterest > 0.45 && asset.change24h > 0
  const dailyBorrow = Math.abs(borrowOver('short', asset.borrowFee, EXAMPLE_NOTIONAL, 24))
  const paidToShort = asset.fundingRate > 0

  return (
    <Panel title="Short desk" className="border-0 border-b border-line" bodyClassName="flex flex-col">
      <div className="flex items-start gap-3 px-3 pt-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <Label>Short score</Label>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className={cn(
                'num text-2xl leading-none font-bold',
                s.grade.tone === 'warn' ? 'text-warn' : 'text-accent',
              )}
            >
              {s.score}
            </span>
            <span className="num text-mini text-ink-4">/ 100</span>
          </div>
        </div>
        <Pill tone={s.grade.tone}>{s.grade.label}</Pill>
      </div>

      <div className="px-3">
        <Meter value={s.score / 100} tone={s.grade.tone} />
      </div>
      <p className="px-3 pt-2 pb-2.5 text-micro leading-[1.45] text-ink-3">{s.grade.verdict}</p>

      {squeezing && (
        <div className="flex gap-2 border-t border-warn/25 bg-warn/[0.06] px-3 py-2">
          <AlertTriangle size={13} className="mt-px shrink-0 text-warn" aria-hidden />
          <div className="min-w-0">
            <p className="text-mini font-semibold text-warn">Squeeze risk</p>
            <p className="mt-0.5 text-micro leading-[1.45] text-ink-3">
              <span className="num">{rate(asset.shortInterest, 0)}</span> of open interest is already
              short and the token is <span className="num">{pct(asset.change24h)}</span> over 24h. A
              crowded short into strength is how people get liquidated: every cover order is itself a
              buy, so the first leg up funds the second.
            </p>
          </div>
        </div>
      )}

      <Row
        label="Short interest"
        value={rate(asset.shortInterest, 1)}
        meter={s.crowding}
        tone={asset.shortInterest > 0.45 ? 'warn' : 'accent'}
        note={
          asset.shortInterest > 0.45
            ? 'Crowded. Most of the open interest is already short, so the marginal seller is gone and every uptick hunts stops.'
            : asset.shortInterest > 0.25
              ? 'Normal. Enough shorts that the thesis is known, not enough to make covering violent.'
              : 'Light. Little to squeeze — but nobody has done the work for you either.'
        }
      />

      <Row
        label="Borrow cost"
        value={`${rate(asset.borrowFee)} / yr`}
        meter={s.borrow}
        tone={asset.borrowFee > 0.3 ? 'warn' : 'accent'}
        note={
          <>
            Rent on the position:{' '}
            <span className="num">{usd(dailyBorrow)}</span> a day on a{' '}
            <span className="num">{usdAbbr(EXAMPLE_NOTIONAL)}</span> short. The bill runs whether the
            price moves or not.
          </>
        }
      />

      <Row
        label="Funding"
        value={`${signedRate(asset.fundingRate)} / 8h`}
        meter={1 - s.carry}
        tone={paidToShort ? 'accent' : 'warn'}
        note={
          paidToShort ? (
            <>
              Longs are paying shorts. Holding this short collects about{' '}
              <span className="num">{rate(s.fundingAnnual, 1)}</span> a year, which offsets the
              borrow.
            </>
          ) : (
            <>
              Shorts are paying longs about{' '}
              <span className="num">{rate(Math.abs(s.fundingAnnual), 1)}</span> a year, on top of the
              borrow fee.
            </>
          )
        }
      />

      <Row
        label="Liquidity depth"
        value={usdAbbr(asset.liquidity)}
        meter={1 - s.depth}
        tone={asset.liquidity < 8e6 ? 'warn' : 'accent'}
        note={
          <>
            Covering <span className="num">{usdAbbr(25_000)}</span> takes{' '}
            <span className="num">{rate(25_000 / asset.liquidity, 2)}</span> of the pool.
            Thin depth is only ever a problem on the way out.
          </>
        }
      />

      <Row
        label="24h momentum"
        value={pct(asset.change24h)}
        valueClassName={asset.change24h >= 0 ? 'text-long' : 'text-short'}
        meter={clamp01(Math.abs(asset.change24h) / 8)}
        tone={asset.change24h >= 0 ? 'long' : 'short'}
        note={
          asset.change24h < 0
            ? 'Falling into the thesis. Trend and carry point the same way, which is the only time a short is cheap in both senses.'
            : 'Rising against a short. You are paying borrow to wait for a turn that has not started.'
        }
      />

      <p className="border-t border-line px-3 py-2 text-micro leading-[1.4] text-ink-4">
        House model over borrow, funding, crowding, depth and momentum. It scores the cost of the
        trade, not the future of the company.
      </p>
    </Panel>
  )
}

function Row({
  label,
  value,
  valueClassName,
  meter,
  tone,
  note,
}: {
  label: string
  value: string
  valueClassName?: string
  meter: number
  tone: 'accent' | 'warn' | 'long' | 'short'
  note: ReactNode
}) {
  return (
    <div className="border-t border-line px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-mini font-medium text-ink-2">{label}</span>
        <span className={cn('num text-mini font-semibold', valueClassName ?? 'text-ink')}>
          {value}
        </span>
      </div>
      <Meter value={meter} tone={tone} className="mt-1.5" />
      <p className="mt-1.5 text-micro leading-[1.45] text-ink-4">{note}</p>
    </div>
  )
}
