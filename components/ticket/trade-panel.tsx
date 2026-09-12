'use client'

/**
 * The right-hand column of the token sheet: buy, sell, or open a short.
 *
 * Only the selected ticket is mounted. Each one runs its own quote loop, and
 * keeping all three alive would triple the quoting against the same pool.
 */

import { useState } from 'react'
import { OpenTicket } from '@/components/ticket/open-ticket'
import { TradeTicket } from '@/components/ticket/trade-ticket'
import type { TokenRow } from '@/lib/protocol/types'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type Tab = 'buy' | 'sell' | 'short'

const ACTIVE: Record<Tab, string> = {
  buy: 'bg-long text-void',
  sell: 'bg-short text-void',
  short: 'bg-ink text-void',
}

export function TradePanel({ token }: { token: TokenRow }) {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('buy')
  const tabs: { key: Tab; label: string }[] = [
    { key: 'buy', label: t('trade.buy') },
    { key: 'sell', label: t('trade.sell') },
    { key: 'short', label: t('trade.short') },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="seg" role="tablist">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 py-2 text-xs font-semibold transition-colors',
              tab === key ? ACTIVE[key] : 'text-ink-3 hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'short' ? <OpenTicket token={token} /> : <TradeTicket token={token} side={tab} />}
    </div>
  )
}
