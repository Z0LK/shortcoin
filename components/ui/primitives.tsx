'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { clamp01 } from '@/lib/format'

/** Small uppercase label used above every panel and every stat. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'mono text-[9.5px] font-medium text-ink-3',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('panel flex min-h-0 flex-col', className)}>
      {(title || right) && (
        <header className="flex h-[var(--head-h)] shrink-0 items-center justify-between border-b border-line px-4">
          <Label>{title}</Label>
          {right}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Pill({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode
  tone?: 'neutral' | 'long' | 'short' | 'warn' | 'info' | 'accent'
  className?: string
  /** Pills carry dense abbreviations; the hover text is where they explain themselves. */
  title?: string
}) {
  const tones: Record<string, string> = {
    neutral: 'border-line bg-white/[0.03] text-ink-2',
    long: 'border-long/25 bg-long/10 text-long',
    short: 'border-short/25 bg-short/10 text-short',
    warn: 'border-warn/25 bg-warn/10 text-warn',
    info: 'border-info/25 bg-info/10 text-info',
    accent: 'border-accent/25 bg-accent/10 text-accent',
  }
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-[12px] border px-2 py-[2px] text-micro font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Horizontal meter. Used for short interest, borrow cost and liq proximity. */
export function Meter({
  value,
  tone = 'accent',
  className,
}: {
  value: number
  tone?: 'accent' | 'long' | 'short' | 'warn'
  className?: string
}) {
  const tones: Record<string, string> = {
    accent: 'bg-accent',
    long: 'bg-long',
    short: 'bg-short',
    warn: 'bg-warn',
  }
  return (
    <div className={cn('h-[3px] w-full overflow-hidden rounded-[12px] bg-line', className)}>
      <div
        className={cn('h-full rounded-[12px] transition-[width] duration-500', tones[tone])}
        style={{ width: `${clamp01(value) * 100}%` }}
      />
    </div>
  )
}

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: ReactNode
  value: ReactNode
  tone?: 'long' | 'short' | 'warn' | 'muted'
  hint?: ReactNode
}) {
  const tones: Record<string, string> = {
    long: 'text-long',
    short: 'text-short',
    warn: 'text-warn',
    muted: 'text-ink-3',
  }
  return (
    <div className="flex flex-col gap-0.5">
      <Label>{label}</Label>
      <span className={cn('num text-sm font-semibold', tone ? tones[tone] : 'text-ink')}>
        {value}
      </span>
      {hint && <span className="text-micro text-ink-4">{hint}</span>}
    </div>
  )
}

export function Button({
  children,
  variant = 'ghost',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'accent' | 'long' | 'short' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}) {
  const variants: Record<string, string> = {
    accent: 'btn-primary',
    long: 'rounded-[12px] bg-long text-[#04120b] hover:brightness-110',
    short: 'rounded-[12px] bg-short text-[#1a0509] hover:brightness-110',
    ghost: 'btn-ghost',
    outline: 'btn-ghost',
  }
  const sizes: Record<string, string> = {
    sm: 'h-7 px-3 text-micro',
    md: 'h-8 px-4 text-mini',
    lg: 'h-10 px-5 text-xs',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[12px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
