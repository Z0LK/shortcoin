'use client'

/**
 * Terminal layout.
 *
 * Three columns: chart and activity on the left, the ticket in the middle, the
 * instrument rail on the right. The mark price is owned here and pushed down,
 * so the chart, the ticket and the book can never be quoting different numbers.
 */

import { useCallback, useEffect, useState } from 'react'
import { ChartPanel } from '@/components/chart/chart-panel'
import { OrderTicket } from '@/components/terminal/order-ticket'
import { InversionControl } from '@/components/terminal/inversion-control'
import { ActivityPanel } from '@/components/terminal/activity-panel'
import { TokenSidebar } from '@/components/terminal/token-sidebar'
import { useMarket } from '@/components/market-provider'
import { useStore } from '@/lib/store'
import type { Asset } from '@/lib/types'

export function Terminal({ asset }: { asset: Asset }) {
  const [mark, setMark] = useState(asset.price)
  const setLastSymbol = useStore((s) => s.setLastSymbol)
  const engine = useMarket()

  useEffect(() => {
    setLastSymbol(asset.symbol)
    engine?.ensure(asset)
  }, [asset, setLastSymbol, engine])

  const onMark = useCallback((p: number) => setMark(p), [])

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px_300px] gap-px bg-line">
      <div className="flex min-h-0 min-w-0 flex-col gap-px bg-line">
        <ChartPanel asset={asset} onMark={onMark} />
        <div className="h-[248px] shrink-0">
          <ActivityPanel asset={asset} markPrice={mark} />
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-px overflow-y-auto bg-line">
        <OrderTicket asset={asset} markPrice={mark} />
        <InversionControl asset={asset} />
      </div>

      <div className="min-h-0 overflow-y-auto bg-surface">
        <TokenSidebar asset={asset} />
      </div>
    </div>
  )
}
