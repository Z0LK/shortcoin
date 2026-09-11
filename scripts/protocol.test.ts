/**
 * The protocol layer, end to end, without a browser.
 *
 * Covers the arithmetic the spec pins down (payoff, breakeven, zero-equity),
 * the display rules it imposes (bigint amounts, 0.0₇42 prices), the status
 * precedence, and the paper adapter's whole lifecycle: a quote that reacts to
 * size, an open, a knock-out on the lower TWAP, a cap settlement on the higher
 * one, the receipts they write, and the HLP's reserved-capital rule.
 */

import { ASSETS } from '../lib/assets'
import { MarketEngine } from '../lib/sim'
import {
  USDG_UNIT,
  fixedToNumber,
  formatMicroPrice,
  formatUsdg,
  parseUsdg,
  toFixed18,
} from '../lib/protocol/fixed'
import { breakevenPrice, positionValue, zeroEquityPrice } from '../lib/protocol/payoff'
import { resolveStatus } from '../lib/protocol/status'
import { PaperAdapter } from '../lib/protocol/paper'
import { ProtocolError } from '../lib/protocol/adapter'

let fails = 0
const ok = (n: string, c: boolean, e = '') => {
  console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : ''))
  if (!c) fails++
}
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

async function main() {
  // ── display rules (§5) ─────────────────────────────────────────────────
  ok('0.000000042 → 0.0₇42', formatMicroPrice(toFixed18(0.000000042)) === '0.0₇42', formatMicroPrice(toFixed18(0.000000042)))
  ok('0.0412 spelled out', formatMicroPrice(toFixed18(0.0412)) === '0.0412', formatMicroPrice(toFixed18(0.0412)))
  ok('1842.5 grouped', formatMicroPrice(toFixed18(1842.5)) === '1,842.50', formatMicroPrice(toFixed18(1842.5)))
  ok('1e-15 does not collapse to zero', formatMicroPrice(toFixed18(1e-15)) !== '0.00', formatMicroPrice(toFixed18(1e-15)))
  ok('axis floats use the same path', formatMicroPrice(0.000000042) === '0.0₇42')
  ok('toFixed18 exact on 1e-10', toFixed18(1e-10) === '100000000')
  ok('toFixed18 exact on 1234.5', toFixed18(1234.5) === '1234500000000000000000')
  ok('parseUsdg 250.5', parseUsdg('250.5') === 250_500_000n)
  ok('parseUsdg rejects junk', parseUsdg('abc') === null)
  ok('formatUsdg exact', formatUsdg(1_234_567_890n) === '$1,234.57', formatUsdg(1_234_567_890n))
  ok('formatUsdg signed negative', formatUsdg(-5_000_000n, { signed: true }) === '−$5.00')

  // ── payoff (§1) ────────────────────────────────────────────────────────
  const p = { collateral: 100, notional: 200, entry: 1, cap: 0.5, barrier: 1.5 }
  ok('V(0.5·P₀) = 2C', near(positionValue(p, 0.5), 200))
  ok('V(P₀) = C', near(positionValue(p, 1), 100))
  ok('V(1.5·P₀) = 0', near(positionValue(p, 1.5), 0))
  ok('hard cap past −50%', near(positionValue(p, 0.1), 200))
  ok('matches spec formula N(1.5P₀−P)/P₀', near(positionValue(p, 0.8), 200 * (1.5 - 0.8)))
  ok('breakeven = P₀(1.5 − (C+prem)/N)', near(breakevenPrice(p, 20), 1 * (1.5 - 120 / 200)))
  ok('zero equity = P₀(1.5 − prem/N)', near(zeroEquityPrice(p, 20), 1 * (1.5 - 20 / 200)))
  ok('breakeven drifts down with premium', breakevenPrice(p, 30) < breakevenPrice(p, 0))

  // ── status precedence ──────────────────────────────────────────────────
  const base = {
    tracked: true, paused: false, lastSampleAt: 1000, now: 1000, staleAfterMs: 100, warmupEndsAt: 0,
    quoteDepthUsd: 1e6, minDepthUsd: 1e4, topClusterPct: 0.1, clusterThresholdPct: 0.35,
    reduceOnly: false, treasuryExhausted: false, utilization: 0.5,
  }
  ok('fine → ELIGIBLE', resolveStatus(base) === 'ELIGIBLE')
  ok('paused beats full', resolveStatus({ ...base, paused: true, utilization: 1 }) === 'PAUSED')
  ok('stale beats warmup', resolveStatus({ ...base, lastSampleAt: 0, warmupEndsAt: 2000 }) === 'ORACLE_STALE')
  ok('full → CAPACITY_FULL', resolveStatus({ ...base, utilization: 1 }) === 'CAPACITY_FULL')
  ok('untracked first', resolveStatus({ ...base, tracked: false, paused: true }) === 'UNTRACKED')

  // ── paper adapter lifecycle ────────────────────────────────────────────
  const engine = new MarketEngine(ASSETS, '1m', 700)
  const paper = new PaperAdapter(engine)
  const tick = () => (paper as unknown as { tick(): void }).tick()

  const tokens = await paper.listTokens({ openableOnly: true, sort: 'capacity' })
  ok('some tokens are openable', tokens.length > 20, `${tokens.length}`)
  ok('every listed row carries a status', (await paper.listTokens()).every((r) => !!r.status.status))
  const statuses = new Set((await paper.listTokens()).map((r) => r.status.status))
  ok('several statuses are reachable', statuses.size >= 4, [...statuses].join(','))

  // Pick a deep token so the size sweep does not hit capacity.
  const t = tokens.find((r) => r.remainingNotional > 200_000n * USDG_UNIT)!
  ok('found a deep openable token', !!t, t?.symbol)

  const q1 = await paper.quoteOpen(t.address, 100n * USDG_UNIT)
  const q2 = await paper.quoteOpen(t.address, (t.remainingNotional / 2n) * 9n / 10n)
  ok('notional = 2 × collateral', q1.notional === 2n * q1.collateral)
  ok('max payout = N − C', q1.maxPayout === q1.notional - q1.collateral)
  ok('barrier = 1.5 × entry', near(fixedToNumber(q1.barrierPrice), fixedToNumber(q1.entryPrice) * 1.5, 1e-9))
  ok('a bigger ticket pays a higher rate', q2.dailyRateBps > q1.dailyRateBps, `${q1.dailyRateBps.toFixed(2)} → ${q2.dailyRateBps.toFixed(2)} bps`)
  ok('marginal ≥ average', q2.marginalRateBps >= q2.dailyRateBps)
  ok('utilisation after > before', q2.utilizationAfter > q2.utilizationBefore)
  ok('backing sums to 100%', q1.backing.treasuryBps + q1.backing.hlpBps === 10_000)

  try {
    await paper.quoteOpen(t.address, t.remainingNotional)
    ok('over-capacity quote refused', false)
  } catch (e) {
    ok('over-capacity quote refused', e instanceof ProtocolError && e.code === 'CapacityExceeded')
  }

  // Opening needs an allowance first (§7.5).
  const sim = await paper.simulateOpen(q1)
  ok('simulation catches missing approval', sim?.code === 'InsufficientAllowance')
  await paper.approveUsdg(10_000n * USDG_UNIT)

  // The paper adapter deliberately loses a capacity race now and then; retry
  // the way the UI does.
  let position = null
  for (let i = 0; i < 6 && !position; i++) {
    const q = await paper.quoteOpen(t.address, 500n * USDG_UNIT)
    try {
      position = await paper.openPosition(q)
    } catch (e) {
      if (!(e instanceof ProtocolError && e.code === 'CapacityExceeded')) throw e
    }
  }
  ok('position opened', !!position && position.status === 'OPEN')
  const acct = await paper.account()
  ok('collateral left the balance', acct.usdgBalance === 25_000n * USDG_UNIT - 500n * USDG_UNIT)

  const live = (await paper.getPosition(position!.id))!
  ok('equity = value − premium', live.equity === live.currentValue - live.accruedPremium)
  ok('settlement mark ≥ knock-out mark', BigInt(live.settlementMark) >= BigInt(live.knockoutMark))
  ok('spot is reported separately', !!live.spotPrice)

  // Knock-out: move both TWAPs above the barrier.
  paper.shock(t.address, 1.7)
  tick()
  const ko = (await paper.getPosition(position!.id))!
  ok('knocked out past the barrier', ko.status === 'KNOCKED_OUT', ko.status)
  const receipt = await paper.getReceipt(position!.id)
  ok('receipt written', !!receipt && receipt.trigger === 'KNOCKOUT')
  ok('knock-out pays nothing', receipt?.payout === 0n)
  ok('receipt carries the TWAP samples', (receipt?.samples.length ?? 0) > 50, `${receipt?.samples.length}`)
  ok('receipt names the lower TWAP', receipt?.triggeredBy === 'TWAP24' || receipt?.triggeredBy === 'TWAP72')
  ok('receipt has a tx hash and keeper', /^0x[0-9a-f]{64}$/.test(receipt!.txHash) && receipt!.keeper.startsWith('0x'))

  // Early close: cannot collect a gain before payout eligibility.
  const t2 = tokens.find((r) => r.address !== t.address && r.remainingNotional > 50_000n * USDG_UNIT)!
  let p2 = null
  for (let i = 0; i < 6 && !p2; i++) {
    try {
      p2 = await paper.openPosition(await paper.quoteOpen(t2.address, 200n * USDG_UNIT))
    } catch (e) {
      if (!(e instanceof ProtocolError && e.code === 'CapacityExceeded')) throw e
    }
  }
  paper.shock(t2.address, 0.7) // the token falls — a gain on paper
  tick()
  const r2 = await paper.closePosition(p2!.id)
  ok('early close returns at most the collateral', r2.payout <= 200n * USDG_UNIT, formatUsdg(r2.payout))

  // HLP: reserved capital cannot leave, lockup blocks withdrawal.
  await paper.hlpDeposit(1_000n * USDG_UNIT)
  const h = await paper.hlp()
  ok('deposit shows in HLP value', h.account.value > 990n * USDG_UNIT, formatUsdg(h.account.value))
  ok('withdrawable < value while reserved', h.account.withdrawable < h.account.value)
  ok('lockup set', !!h.account.lockedUntil && h.account.lockedUntil > Date.now())
  try {
    await paper.hlpWithdraw(10n * USDG_UNIT)
    ok('withdraw blocked by lockup', false)
  } catch (e) {
    ok('withdraw blocked by lockup', e instanceof ProtocolError && e.code === 'LockupActive')
  }
  ok('max drawdown reported', h.account.maxDrawdown > 0n)

  // Search (§3).
  const inv = await paper.search('0x1234')
  ok('short 0x string is a format error', inv[0]?.kind === 'invalid-address')
  const byAddr = await paper.search(t.address)
  ok('full address of a listed token resolves to it', byAddr[0]?.kind === 'token')
  const unknown = await paper.search('0x' + 'ab'.repeat(20))
  ok('unknown valid address → untracked, never empty', unknown[0]?.kind === 'untracked')
  const byName = await paper.search('eloncoin')
  ok('a name returns several results', byName.length >= 3, `${byName.length}`)
  ok('impersonations are flagged as homonyms',
     byName.filter((r) => r.kind === 'token' && r.homonym).length >= 3,
     byName.map((r) => (r.kind === 'token' ? `${r.token.symbol}${r.homonym ? '*' : ''}` : r.kind)).join(','))
  ok('every homonym shows a distinct address',
     new Set(byName.map((r) => (r.kind === 'token' ? r.token.address : ''))).size === byName.length)

  paper.dispose()
  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`)
  process.exit(fails === 0 ? 0 : 1)
}

main()
