/**
 * Mode flag, adapter construction, and the access-restriction layer.
 *
 * SPEC §7.4: one environment variable picks the mode, and the same UI runs on
 * all three. `NEXT_PUBLIC_MODE` because Next only exposes prefixed variables
 * to the browser; anything unrecognised falls back to paper, which is the only
 * mode that can do harm to nobody.
 *
 * SPEC §7.7: a barrier product with loss capped at the collateral, distributed
 * to European retail, touches ESMA and MiCA. The decision of WHO may open a
 * position is a product decision that has not been taken. What exists here is
 * the place it will plug in: every opening action asks `accessPolicy` first,
 * and the policy is configuration, not code scattered through components.
 */

import { ASSETS } from '@/lib/assets'
import { MarketEngine } from '@/lib/sim'
import type { Mode, ProtocolAdapter } from './adapter'
import { IndexerAdapter } from './indexer'
import { PaperAdapter } from './paper'

export function currentMode(): Mode {
  const raw = process.env.NEXT_PUBLIC_MODE
  return raw === 'testnet' || raw === 'mainnet' ? raw : 'paper'
}

interface Runtime {
  mode: Mode
  engine: MarketEngine
  adapter: ProtocolAdapter
  /** Present only in paper mode — the dev levers live on it. */
  paper: PaperAdapter | null
}

let runtime: Runtime | null = null

/** Client-side singleton. The server never constructs an adapter. */
export function getRuntime(): Runtime {
  if (runtime) return runtime
  const mode = currentMode()
  const engine = new MarketEngine(ASSETS, '1m', 700)
  if (mode === 'paper') {
    const paper = new PaperAdapter(engine)
    runtime = { mode, engine, adapter: paper, paper }
  } else {
    runtime = {
      mode,
      engine,
      adapter: new IndexerAdapter(mode, process.env.NEXT_PUBLIC_INDEXER_URL, null),
      paper: null,
    }
  }
  return runtime
}

// ---------------------------------------------------------------------------
// Access policy (§7.7)
// ---------------------------------------------------------------------------

export interface AccessDecision {
  allowed: boolean
  /** i18n key explaining why, when not allowed. */
  reasonKey?: string
}

/**
 * Regions where opening is refused, as ISO country codes, from configuration.
 * Empty in paper mode by construction: nothing there reaches a venue.
 */
function restrictedRegions(mode: Mode): string[] {
  if (mode === 'paper') return []
  return (process.env.NEXT_PUBLIC_RESTRICTED_REGIONS ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
}

/**
 * `region` has to come from something trustworthy — an edge header set by the
 * host, not the browser's locale. Until that source is chosen, an unknown
 * region is allowed in paper mode and refused anywhere real money could move.
 */
export function accessPolicy(mode: Mode, region: string | null): AccessDecision {
  if (mode === 'paper') return { allowed: true }
  if (!region) return { allowed: false, reasonKey: 'access.unknownRegion' }
  if (restrictedRegions(mode).includes(region.toUpperCase())) {
    return { allowed: false, reasonKey: 'access.restricted' }
  }
  return { allowed: true }
}
