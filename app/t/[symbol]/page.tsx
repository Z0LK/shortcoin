import { notFound } from 'next/navigation'
import { Terminal } from '@/components/terminal/terminal'
import { ASSETS } from '@/lib/assets'
import { resolveAsset } from '@/lib/universe'

/**
 * The named universe is prerendered. The Pons tail is four million tokens deep
 * and generated on demand, so those pages are rendered when somebody asks for
 * one — which is also the only moment the token needs to exist.
 */
export const dynamicParams = true

export function generateStaticParams() {
  return ASSETS.map((a) => ({ symbol: a.symbol }))
}

type Params = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Params) {
  const { symbol } = await params
  const asset = resolveAsset(symbol)
  if (!asset) return { title: 'Unknown token — SHORTCOIN' }
  return {
    title: `${asset.symbol} · ${asset.name} — SHORTCOIN`,
    description: `Trade ${asset.symbol} long or short on Robinhood Chain. Invert the chart to open a synthetic short on ${asset.name}.`,
  }
}

export default async function TerminalPage({ params }: Params) {
  const { symbol } = await params
  const asset = resolveAsset(symbol)
  if (!asset) notFound()

  return <Terminal asset={asset} />
}
