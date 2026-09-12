'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { ProtocolProvider } from '@/components/protocol/provider'
import { Notifications } from '@/components/shell/notifications'
import { TopNav } from '@/components/shell/top-nav'
import { TickerTape } from '@/components/shell/ticker-tape'
import { CommandPalette } from '@/components/shell/command-palette'
import { useRehydrateStore } from '@/lib/store'

/**
 * The landing page's ambience, behind every screen: a violet and cyan wash,
 * moving grain, a vignette, and a soft glow that trails the pointer. All of it
 * sits under the content, so it tints the glass without greying a number.
 */
function Backdrop() {
  const glow = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // No pointer to follow on touch screens.
    if (!window.matchMedia('(pointer: fine)').matches) return
    let frame = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        glow.current?.style.setProperty('--cx', `${e.clientX}px`)
        glow.current?.style.setProperty('--cy', `${e.clientY}px`)
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
    }
  }, [])

  return (
    <div aria-hidden>
      <div className="fx-tint" />
      <div className="fx-vignette" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="fx-grain" />
      </div>
      <div ref={glow} className="cursor-glow" />
    </div>
  )
}

export function AppChrome({ children }: { children: ReactNode }) {
  useRehydrateStore()

  return (
    <ProtocolProvider>
      <Backdrop />
      <div className="relative z-10 flex h-screen flex-col overflow-hidden">
        <TopNav />
        <TickerTape />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <CommandPalette />
      <Notifications />
    </ProtocolProvider>
  )
}
