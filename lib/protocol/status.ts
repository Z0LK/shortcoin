/**
 * Eligibility state machine.
 *
 * One function decides which of the ten statuses a token is in, in a fixed
 * order of precedence, and one table says what each status permits. Both the
 * paper adapter and the UI read from here, so "can I open this?" has exactly
 * one answer in the codebase.
 *
 * Precedence runs from "the protocol itself is off" down to "fine": a token
 * that is both paused and full is reported as paused, because that is the
 * reason that will still be true after capacity frees up.
 */

import type { TokenStatus } from './types'

export interface EligibilityInputs {
  tracked: boolean
  paused: boolean
  /** Unix ms of the last oracle sample. */
  lastSampleAt: number
  now: number
  /** Oracle samples older than this block opening. */
  staleAfterMs: number
  /** Unix ms at which 24h of TWAP history exists. */
  warmupEndsAt: number
  quoteDepthUsd: number
  minDepthUsd: number
  topClusterPct: number
  clusterThresholdPct: number
  reduceOnly: boolean
  treasuryExhausted: boolean
  utilization: number
}

export function resolveStatus(i: EligibilityInputs): TokenStatus {
  if (!i.tracked) return 'UNTRACKED'
  if (i.paused) return 'PAUSED'
  // A stale oracle is a security condition, not a performance one — it sits
  // above every market condition because every other number depends on it.
  if (i.now - i.lastSampleAt > i.staleAfterMs) return 'ORACLE_STALE'
  if (i.now < i.warmupEndsAt) return 'WARMUP'
  if (i.quoteDepthUsd < i.minDepthUsd) return 'INELIGIBLE_DEPTH'
  if (i.topClusterPct > i.clusterThresholdPct) return 'INELIGIBLE_CONCENTRATION'
  if (i.reduceOnly) return 'REDUCE_ONLY'
  if (i.treasuryExhausted) return 'TREASURY_EXHAUSTED'
  if (i.utilization >= 1) return 'CAPACITY_FULL'
  return 'ELIGIBLE'
}

export interface StatusRules {
  canOpen: boolean
  canClose: boolean
  /** Whether the UI should render a countdown to `recheckAt`. */
  timed: boolean
  tone: 'long' | 'warn' | 'short' | 'neutral' | 'info'
}

export const STATUS_RULES: Record<TokenStatus, StatusRules> = {
  ELIGIBLE: { canOpen: true, canClose: true, timed: false, tone: 'long' },
  WARMUP: { canOpen: false, canClose: true, timed: true, tone: 'info' },
  CAPACITY_FULL: { canOpen: false, canClose: true, timed: false, tone: 'warn' },
  TREASURY_EXHAUSTED: { canOpen: false, canClose: true, timed: false, tone: 'warn' },
  REDUCE_ONLY: { canOpen: false, canClose: true, timed: false, tone: 'warn' },
  INELIGIBLE_CONCENTRATION: { canOpen: false, canClose: true, timed: false, tone: 'short' },
  INELIGIBLE_DEPTH: { canOpen: false, canClose: true, timed: false, tone: 'short' },
  // Closing still works: it settles on TWAPs that were fresh when they were
  // computed. Opening does not, because the entry price would be a guess.
  ORACLE_STALE: { canOpen: false, canClose: true, timed: true, tone: 'warn' },
  PAUSED: { canOpen: false, canClose: false, timed: false, tone: 'short' },
  UNTRACKED: { canOpen: false, canClose: false, timed: false, tone: 'neutral' },
}

/** Every status, in the order the filters list them. */
export const STATUS_ORDER: TokenStatus[] = [
  'ELIGIBLE',
  'WARMUP',
  'ORACLE_STALE',
  'CAPACITY_FULL',
  'TREASURY_EXHAUSTED',
  'REDUCE_ONLY',
  'INELIGIBLE_DEPTH',
  'INELIGIBLE_CONCENTRATION',
  'PAUSED',
  'UNTRACKED',
]
