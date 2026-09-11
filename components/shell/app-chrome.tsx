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
 * The fixed layers behind every screen: a slow aurora of three drifting blobs,
 * scanlines, grain and a vignette. The pointer carries no light of its own —
 * it uncovers a dot matrix that is always there, and a thin ring marks where
 * it is. Panels are smoked glass laid over all of it.
 */
function Backdrop() {
  const layers = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Touch devices have no pointer to follow, and the reveal would be dead
    // weight on a phone's compositor.
    if (!window.matchMedia('(pointer: fine)').matches) return
    const el = layers.current
    if (!el) return
    let frame = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--cx', `${e.clientX}px`)
        el.style.setProperty('--cy', `${e.clientY}px`)
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
      <div className="bg-layer overflow-hidden">
        <div className="aurora aurora-a" />
        <div className="aurora aurora-b" />
        <div className="aurora aurora-c" />
      </div>
      <div className="bg-layer bg-scanlines" />
      <div className="bg-layer bg-noise" />
      <div className="bg-layer bg-vignette" />
      <div ref={layers}>
        <div className="cursor-reveal" />
        <div className="cursor-ring" />
      </div>
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
