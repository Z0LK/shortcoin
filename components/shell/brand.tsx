'use client'

import { cn } from '@/lib/utils'

/**
 * The mark is the product thesis: one chart, reflected.
 *
 * A ghosted rising line above the axis, and the line SHORTCOIN actually trades
 * below it. The half we deal in is the half that is lit.
 */
export function Mark({ size = 22 }: { size?: number }) {
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
        opacity={0.3}
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
      />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 select-none', className)}>
      <Mark />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">
        SHORT<span className="text-ink-3">COIN</span>
      </span>
    </span>
  )
}
