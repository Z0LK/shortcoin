/**
 * Number and time formatting for a trading terminal.
 *
 * Rule of the house: every number rendered in a table or on a ticket goes
 * through here, so alignment, precision and sign conventions stay identical
 * across the whole product.
 */

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })

/** 1_234_567 → "1.23M". Used for volume, liquidity, market cap. */
export function abbr(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) < 1000) return n.toFixed(Math.abs(n) < 10 ? 2 : 0)
  return compact.format(n)
}

export function usdAbbr(n: number): string {
  return `$${abbr(n)}`
}

/**
 * Price with a precision that adapts to magnitude — a $0.0031 token and a
 * $1,842 token should not share a decimal count.
 */
export function price(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  // Exactly zero is a number, not a sub-penny price: it gets two decimals like
  // any other dollar figure, never the eight a 1e-8 token would earn.
  const digits = a === 0 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 8
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function usd(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${price(Math.abs(n))}`
}

/** Always signed — a PnL of exactly zero still reads "+$0.00". */
export function signedUsd(n: number): string {
  return `${n < 0 ? '−' : '+'}$${price(Math.abs(n))}`
}

/** `n` is already in percent units (3.2 → "+3.20%"). */
export function pct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(digits)}%`
}

/** `n` is a fraction (0.032 → "3.20%"), unsigned. */
export function rate(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

export function signedRate(n: number, digits = 4): string {
  return `${n < 0 ? '−' : '+'}${(Math.abs(n) * 100).toFixed(digits)}%`
}

export function shortAddress(a: string, head = 4, tail = 4): string {
  if (a.length <= head + tail + 2) return a
  return `${a.slice(0, head + 2)}…${a.slice(-tail)}`
}

/** "3m", "2h", "5d" — relative age, terminal-terse. */
export function ago(seconds: number, now = Math.floor(Date.now() / 1000)): string {
  const d = Math.max(now - seconds, 0)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

export function clockTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Clamp a 0..1 value for meters and gauges. */
export function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1)
}
