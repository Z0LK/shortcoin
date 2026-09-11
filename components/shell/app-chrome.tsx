'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { ProtocolProvider } from '@/components/protocol/provider'
import { RiskPortal } from '@/components/shell/risk-portal'
import { Notifications } from '@/components/shell/notifications'
import { TopNav } from '@/components/shell/top-nav'
import { TickerTape } from '@/components/shell/ticker-tape'
import { CommandPalette } from '@/components/shell/command-palette'
import { useRehydrateStore } from '@/lib/store'

/**
 * The fixed layers behind every screen: a grid fading out from the top, three
 * lime glows, grain, and a soft light that follows the pointer. Panels are
 * glass laid over these, which is what gives them depth.
 */
function Backdrop() {
  const glow = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Touch devices have no pointer to follow.
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
      <div className="bg-layer bg-glow" />
      <div className="bg-layer bg-grid" />
      <div className="bg-layer bg-noise" />
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
      <RiskPortal />
      <Notifications />
    </ProtocolProvider>
  )
}
