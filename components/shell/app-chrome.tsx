'use client'

import type { ReactNode } from 'react'
import { ProtocolProvider } from '@/components/protocol/provider'
import { RiskPortal } from '@/components/shell/risk-portal'
import { Notifications } from '@/components/shell/notifications'
import { TopNav } from '@/components/shell/top-nav'
import { TickerTape } from '@/components/shell/ticker-tape'
import { CommandPalette } from '@/components/shell/command-palette'
import { useRehydrateStore } from '@/lib/store'

export function AppChrome({ children }: { children: ReactNode }) {
  useRehydrateStore()

  return (
    <ProtocolProvider>
      <div className="flex h-screen flex-col overflow-hidden">
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
