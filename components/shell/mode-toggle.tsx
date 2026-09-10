'use client'

/**
 * The flip.
 *
 * This is the product's one irreplaceable control, so it is a physical switch
 * rather than a checkbox: a segmented track with a sliding block that carries
 * the accent colour. Everything downstream — chart series, ticket, accent
 * variables, the logo — keys off the value it writes.
 */

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Side } from '@/lib/types'

const SIDES: { key: Side; label: string }[] = [
  { key: 'long', label: 'LONG' },
  { key: 'short', label: 'SHORT' },
]

export function ModeToggle({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)

  // Keep the document attribute in step, including after a hard refresh where
  // the store starts from its default.
  useEffect(() => {
    document.documentElement.dataset.mode = mode
  }, [mode])

  // Keyboard: `S` flips the terminal. Traders live on the keyboard, and this is
  // the action they will take most.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /input|textarea|select/i.test(target.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        setMode(useStore.getState().mode === 'long' ? 'short' : 'long')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setMode])

  const h = size === 'sm' ? 'h-6' : 'h-7'
  const text = size === 'sm' ? 'text-micro' : 'text-mini'

  return (
    <div
      role="radiogroup"
      aria-label="Trading direction"
      className={cn(
        'relative isolate grid grid-cols-2 rounded-[5px] border border-line bg-sunken p-[2px]',
        h,
      )}
      title="Flip the terminal (S)"
    >
      {/* sliding block */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-[2px] left-[2px] -z-10 w-[calc(50%-2px)] rounded-[3px]',
          'transition-transform duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
          mode === 'short' ? 'translate-x-full bg-short' : 'translate-x-0 bg-long',
        )}
      />
      {SIDES.map((s) => (
        <button
          key={s.key}
          role="radio"
          aria-checked={mode === s.key}
          onClick={() => setMode(s.key)}
          className={cn(
            'num relative z-10 flex items-center justify-center rounded-[3px] px-2.5 font-bold tracking-[0.08em] transition-colors duration-150',
            text,
            mode === s.key ? 'text-accent-ink' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
