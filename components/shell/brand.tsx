'use client'

import { cn } from '@/lib/utils'

/**
 * The mark: a rounded panel tile with a lime edge, and a line that falls to a
 * floor. The short, and the cap under it.
 */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M3 6 L9 12 L13 8.5 L21 17" stroke="var(--ink)" strokeWidth="2" strokeLinecap="square" />
      <path d="M15 17 h6 v-6" stroke="var(--ink)" strokeWidth="2" strokeLinecap="square" />
      <path d="M3 21 H21" stroke="var(--line-strong)" strokeWidth="1.5" />
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
