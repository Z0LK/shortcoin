'use client'

import { cn } from '@/lib/utils'

/**
 * The mark is the product thesis: one chart, reflected.
 *
 * A rising line above the axis, the same line falling below it. In short mode
 * the emphasis crosses over to the lower half — the logo itself flips with the
 * terminal, which is the cheapest possible way to keep the user oriented.
 */
export function Mark({ side = 'long', size = 22 }: { side?: 'long' | 'short'; size?: number }) {
  const shortActive = side === 'short'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0 overflow-visible"
    >
      {/* upper half — the underlying */}
      <path
        d="M2 11.5 L7 6.5 L11 9.5 L16 3.5 L22 7"
        stroke="var(--long)"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="transition-opacity duration-300"
        opacity={shortActive ? 0.28 : 1}
      />
      {/* the axis of reflection */}
      <path d="M0 12 H24" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="2 2" />
      {/* lower half — the inverse */}
      <path
        d="M2 12.5 L7 17.5 L11 14.5 L16 20.5 L22 17"
        stroke="var(--short)"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="transition-opacity duration-300"
        opacity={shortActive ? 1 : 0.28}
      />
    </svg>
  )
}

export function Wordmark({ side = 'long', className }: { side?: 'long' | 'short'; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 select-none', className)}>
      <Mark side={side} />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">
        SHORT<span className="text-ink-3">COIN</span>
      </span>
    </span>
  )
}
