import { notFound } from 'next/navigation'
import { Terminal } from '@/components/terminal/terminal'
import { ASSETS, getAsset } from '@/lib/assets'

/** The universe is static and small, so every terminal is prerendered. */
export function generateStaticParams() {
  return ASSETS.map((a) => ({ symbol: a.symbol }))
}

type Params = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Params) {
  const { symbol } = await params
  const asset = getAsset(symbol)
  if (!asset) return { title: 'Unknown token — SHORTCOIN' }
  return {
    title: `${asset.symbol} · ${asset.name} — SHORTCOIN`,
    description: `Trade ${asset.symbol} long or short on Robinhood Chain. Invert the chart to open a synthetic short on ${asset.name}.`,
  }
}

export default async function TerminalPage({ params }: Params) {
  const { symbol } = await params
  const asset = getAsset(symbol)
  if (!asset) notFound()

  return <Terminal asset={asset} />
}
