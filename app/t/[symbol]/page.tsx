import { notFound } from 'next/navigation'
import { Terminal } from '@/components/terminal/terminal'
import { ASSETS } from '@/lib/assets'
import { resolveAsset } from '@/lib/universe'
import { isAddress, readToken } from '@/lib/chain'
import { assetFromChain, toPayload } from '@/lib/imported'

/**
 * Resolve anything the URL can carry: a listed ticker, a generated tail token,
 * or a bare contract address, which is read off Robinhood Chain on the server.
 */
async function resolve(symbol: string) {
  const known = resolveAsset(symbol)
  if (known) return known

  if (isAddress(symbol)) {
    const token = await readToken(symbol)
    if (token) return assetFromChain(toPayload(token))
  }
  return undefined
}

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
  const asset = await resolve(symbol)
  if (!asset) return { title: 'Unknown token — SHORTCOIN' }
  return {
    title: `${asset.symbol} · ${asset.name} — SHORTCOIN`,
    description: `Trade ${asset.symbol} long or short on Robinhood Chain. Invert the chart to open a synthetic short on ${asset.name}.`,
  }
}

export default async function TerminalPage({ params }: Params) {
  const { symbol } = await params
  const asset = await resolve(symbol)
  if (!asset) notFound()

  return <Terminal asset={asset} />
}
