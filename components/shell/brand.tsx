'use client'

import { cn } from '@/lib/utils'

/**
 * The mark is the landing page's: a small triangle filled with the moving
 * spectrum. The wordmark is set in Syne, spaced wide, like PRISM's.
 */
export function Mark({ size = 13 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="spectrum-bg block shrink-0"
      style={{ width: size, height: size, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
    />
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5 select-none', className)}>
      <Mark />
      <span className="font-display text-[14px] font-bold tracking-[0.26em]">SHORTCOIN</span>
    </span>
  )
}
