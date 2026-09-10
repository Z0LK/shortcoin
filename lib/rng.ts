/**
 * Deterministic pseudo-randomness.
 *
 * Every fake number in SHORTCOIN is derived from a seed, never from
 * `Math.random()`. Two reasons: the server and the client must render the same
 * first frame (otherwise React hydration screams), and a symbol's chart should
 * look the same every time you open it instead of being reinvented on each nav.
 */

/** Hash a string into a 32-bit seed. FNV-1a. */
export function seedFrom(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — small, fast, good enough for fake candles. */
export function rng(seed: number | string) {
  let a = typeof seed === 'string' ? seedFrom(seed) : seed >>> 0
  return function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box–Muller: turn a uniform generator into a standard normal one. */
export function gaussian(next: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = next()
  while (v === 0) v = next()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function pick<T>(next: () => number, arr: readonly T[]): T {
  return arr[Math.floor(next() * arr.length) % arr.length]
}

export function between(next: () => number, min: number, max: number): number {
  return min + next() * (max - min)
}
