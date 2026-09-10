/**
 * Robinhood Chain, read-only.
 *
 * This is the one place in SHORTCOIN that touches a real network. Trading is
 * simulated and will stay simulated, but a token's IDENTITY should not be: if
 * you paste a contract address, the honest answer is whatever the chain says,
 * not "not found" because it happens to be missing from a local list.
 *
 * Server-side only — it is called from a Route Handler, which keeps the RPC
 * endpoint off the client and sidesteps CORS entirely.
 */

import { CHAIN } from './assets'

/** Verified against eth_chainId, which returns 0x1237 = 4663. */
export const RPC_URL = CHAIN.rpc

const SELECTOR = {
  symbol: '0x95d89b41',
  name: '0x06fdde03',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
} as const

export interface OnChainToken {
  address: string
  symbol: string
  name: string
  decimals: number
  /** Raw total supply, already divided down by `decimals`. */
  supply: number
}

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim())
}

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase()
}

async function rpc(method: string, params: unknown[]): Promise<string | null> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      // The chain is the source of truth; a stale identity is worse than a slow one.
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { result?: string; error?: unknown }
    if (typeof json.result !== 'string') return null
    return json.result
  } catch {
    return null
  }
}

function call(address: string, data: string) {
  return rpc('eth_call', [{ to: address, data }, 'latest'])
}

/**
 * Decode an ABI-encoded string return.
 *
 * The usual shape is offset + length + padded data. A handful of older tokens
 * return a raw bytes32 instead, which is why the short case is handled rather
 * than rejected — a token that does not decode is a token the user cannot find.
 */
function decodeString(hex: string | null): string | null {
  if (!hex || hex === '0x') return null
  const body = hex.slice(2)

  const fromBytes = (chunk: string) => {
    let out = ''
    for (let i = 0; i < chunk.length; i += 2) {
      const code = parseInt(chunk.slice(i, i + 2), 16)
      if (code === 0) continue
      // Anything outside printable ASCII means this was not a string.
      if (code < 32 || code > 126) return null
      out += String.fromCharCode(code)
    }
    return out.trim() || null
  }

  // bytes32
  if (body.length === 64) return fromBytes(body)

  if (body.length < 128) return null
  const length = parseInt(body.slice(64, 128), 16)
  if (!Number.isFinite(length) || length === 0 || length > 256) return null
  return fromBytes(body.slice(128, 128 + length * 2))
}

function decodeUint(hex: string | null): number | null {
  if (!hex || hex === '0x') return null
  try {
    return Number(BigInt(hex))
  } catch {
    return null
  }
}

/** Cheap in-process cache. Token metadata does not change. */
const cache = new Map<string, { at: number; token: OnChainToken | null }>()
const TTL_MS = 10 * 60 * 1000

/**
 * Read an ERC-20's identity straight off Robinhood Chain.
 *
 * Returns null when the address holds no code, when the calls fail, or when
 * whatever is there does not answer `symbol()` — all of which mean the same
 * thing to a user: this is not a token they can trade.
 */
export async function readToken(rawAddress: string): Promise<OnChainToken | null> {
  if (!isAddress(rawAddress)) return null
  const address = normalizeAddress(rawAddress)

  const hit = cache.get(address)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.token

  const code = await rpc('eth_getCode', [address, 'latest'])
  if (!code || code === '0x') {
    cache.set(address, { at: Date.now(), token: null })
    return null
  }

  const [symbolHex, nameHex, decimalsHex, supplyHex] = await Promise.all([
    call(address, SELECTOR.symbol),
    call(address, SELECTOR.name),
    call(address, SELECTOR.decimals),
    call(address, SELECTOR.totalSupply),
  ])

  const symbol = decodeString(symbolHex)
  if (!symbol) {
    // Code at the address, but it is not an ERC-20 we can quote.
    cache.set(address, { at: Date.now(), token: null })
    return null
  }

  const decimals = decodeUint(decimalsHex) ?? 18
  const rawSupply = decodeUint(supplyHex) ?? 0

  const token: OnChainToken = {
    address,
    symbol: symbol.slice(0, 16),
    name: (decodeString(nameHex) ?? symbol).slice(0, 64),
    decimals,
    supply: rawSupply / Math.pow(10, decimals),
  }

  cache.set(address, { at: Date.now(), token })
  return token
}
