/**
 * Fixed-point arithmetic and display.
 *
 * SPEC §5: amounts never transit as `number`. USDG is a 6-decimal bigint,
 * prices are 1e18-scaled bigints serialised as strings, and the only place a
 * float is allowed to appear is on its way into a pixel or a glyph.
 *
 * Launchpad tokens quote at 0.000000042 and lower, so the price formatter
 * compacts leading zeros into a subscript (0.0₇42) and does it from the exact
 * decimal digits of the bigint rather than from a float that has already
 * thrown them away.
 */

export const E18 = 10n ** 18n

/** Global Dollar (USDG) — the settlement asset on Robinhood Chain. */
export const USDG_DECIMALS = 6
export const USDG_UNIT = 10n ** BigInt(USDG_DECIMALS)

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/**
 * A float price into a 1e18 fixed-point string. Only used at the boundary with
 * the simulator, which works in floats; it goes through the exponent so a price
 * of 1e-12 or 1e4 does not lose its digits to double rounding.
 */
export function toFixed18(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  const [mantissa, exp] = value.toExponential(15).split('e')
  const digits = BigInt(mantissa.replace('.', ''))
  const shift = Number(exp) - 15 + 18
  const out = shift >= 0 ? digits * 10n ** BigInt(shift) : digits / 10n ** BigInt(-shift)
  return out.toString()
}

export function fixed(value: string | bigint): bigint {
  return typeof value === 'bigint' ? value : BigInt(value || '0')
}

/** Display and graph only. Never feed the result back into arithmetic. */
export function fixedToNumber(value: string | bigint): number {
  const v = fixed(value)
  const whole = v / E18
  const frac = v % E18
  return Number(whole) + Number(frac) / 1e18
}

export function mulFixed(a: bigint, b: bigint): bigint {
  return (a * b) / E18
}

export function divFixed(a: bigint, b: bigint): bigint {
  return b === 0n ? 0n : (a * E18) / b
}

/** A ratio such as 1.5 into 1e18 fixed point, from its exact decimal string. */
export function ratioToFixed(ratio: number): bigint {
  return BigInt(toFixed18(ratio))
}

/** USDG base units → display float. Display only. */
export function usdgToNumber(amount: bigint): number {
  return Number(amount) / Number(USDG_UNIT)
}

/** A user-typed amount into USDG base units. Returns null when unparseable. */
export function parseUsdg(input: string): bigint | null {
  const clean = input.replace(/[\s,$]/g, '')
  if (!/^\d*\.?\d*$/.test(clean) || clean === '' || clean === '.') return null
  const [whole = '0', frac = ''] = clean.split('.')
  const padded = (frac + '0'.repeat(USDG_DECIMALS)).slice(0, USDG_DECIMALS)
  return BigInt(whole || '0') * USDG_UNIT + BigInt(padded || '0')
}

/** USDG base units → value × price, both exact. Result in USDG base units. */
export function usdgTimesFixed(amount: bigint, price: string | bigint): bigint {
  return mulFixed(amount, fixed(price))
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

const SUB = '₀₁₂₃₄₅₆₇₈₉'
const subscript = (n: number) =>
  String(n)
    .split('')
    .map((d) => SUB[Number(d)])
    .join('')

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Format a 1e18 fixed-point price.
 *
 *   1842500000000000000000 → 1,842.50
 *   41200000000000000      → 0.0412
 *   42000000000           → 0.0₇42
 *
 * Accepts a float too, because chart axes hand one over — it is converted to
 * fixed point first so the digits come from the same code path.
 */
export function formatMicroPrice(value: string | bigint | number, significant = 4): string {
  const v = typeof value === 'number' ? BigInt(toFixed18(Math.abs(value))) : fixed(value)
  const negative = typeof value === 'number' ? value < 0 : v < 0n
  const abs = v < 0n ? -v : v
  if (abs === 0n) return '0.00'

  const s = abs.toString().padStart(19, '0')
  const whole = s.slice(0, -18).replace(/^0+(?=\d)/, '')
  const frac = s.slice(-18)
  const sign = negative ? '−' : ''

  if (whole !== '0') {
    const decimals = whole.length >= 4 ? 2 : whole.length >= 2 ? 2 : 4
    const rounded = roundDecimal(whole, frac, decimals)
    return sign + rounded
  }

  const zeros = frac.length - frac.replace(/^0+/, '').length
  const digits = frac.slice(zeros, zeros + significant).replace(/0+$/, '') || '0'

  // Up to three leading zeros reads fine spelled out; beyond that, count them.
  if (zeros <= 3) return `${sign}0.${'0'.repeat(zeros)}${digits}`
  return `${sign}0.0${subscript(zeros)}${digits}`
}

function roundDecimal(whole: string, frac: string, decimals: number): string {
  const scaled = BigInt(whole + frac.slice(0, decimals))
  const next = Number(frac[decimals] ?? '0')
  const rounded = next >= 5 ? scaled + 1n : scaled
  const str = rounded.toString().padStart(decimals + 1, '0')
  const w = str.slice(0, -decimals) || '0'
  const f = str.slice(-decimals)
  return `${groupThousands(w)}.${f}`
}

/** "$1,234.56". Exact, from base units. */
export function formatUsdg(amount: bigint, opts: { signed?: boolean; decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 2
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const scale = 10n ** BigInt(USDG_DECIMALS - decimals)
  const rounded = (abs + scale / 2n) / scale
  const str = rounded.toString().padStart(decimals + 1, '0')
  const whole = groupThousands(str.slice(0, -decimals) || '0')
  const frac = str.slice(-decimals)
  const sign = negative ? '−' : opts.signed ? '+' : ''
  return `${sign}$${whole}${decimals > 0 ? `.${frac}` : ''}`
}

/** "$1.24M" — for depth and capacity, where the last cent is noise. */
export function formatUsdgCompact(amount: bigint): string {
  const n = usdgToNumber(amount)
  if (Math.abs(n) < 1000) return formatUsdg(amount)
  return `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n)}`
}

/** Basis points per day → "0.42% / day". */
export function formatBps(bps: number, digits = 2): string {
  return `${(bps / 100).toFixed(digits)}%`
}

export function formatPct(fraction: number, digits = 1, signed = false): string {
  if (!Number.isFinite(fraction)) return '—'
  const v = fraction * 100
  const sign = v < 0 ? '−' : signed ? '+' : ''
  return `${sign}${Math.abs(v).toFixed(digits)}%`
}
