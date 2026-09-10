'use client'

import type { ReactNode } from 'react'
import { MarketProvider } from '@/components/market-provider'
import { TopNav } from '@/components/shell/top-nav'
import { TickerTape } from '@/components/shell/ticker-tape'
import { CommandPalette } from '@/components/shell/command-palette'
import { useRehydrateStore } from '@/lib/store'

export function AppChrome({ children }: { children: ReactNode }) {
  useRehydrateStore()

  return (
    <MarketProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <TopNav />
        <TickerTape />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <CommandPalette />
    </MarketProvider>
  )
}
