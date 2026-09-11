'use client'

import { cn } from '@/lib/utils'

/**
 * The mark: a rounded glass tile with a lime edge, and a line that falls to a
 * floor. The short, and the cap under it.
 */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="sc-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a220f" />
          <stop offset="1" stopColor="#080b06" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="17" fill="url(#sc-mark)" stroke="#c5f82a" strokeOpacity=".45" strokeWidth="1.5" />
      <path d="M15 20 L26 31 L33 25 L48 40" stroke="#c5f82a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 40 h8 v-8" stroke="#c5f82a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 48 H50" stroke="#c5f82a" strokeOpacity=".35" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
      <circle cx="26" cy="31" r="2.6" fill="#c5f82a" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5 select-none', className)}>
      <Mark />
      <span className="text-[17px] font-bold tracking-[-0.04em]">
        SHORT<span className="text-acid">COIN</span>
      </span>
    </span>
  )
}
