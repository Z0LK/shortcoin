import { TokenSheet } from '@/components/token/token-sheet'
import { ASSETS } from '@/lib/assets'
import { resolveAsset } from '@/lib/universe'

/**
 * Listed tokens are prerendered; the Pons tail and bare contract addresses are
 * rendered on request. The sheet itself reads everything from the protocol
 * adapter on the client, so the server only needs a title.
 */
export const dynamicParams = true

export function generateStaticParams() {
  return ASSETS.map((a) => ({ symbol: a.symbol }))
}

type Params = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Params) {
  const { symbol } = await params
  const asset = resolveAsset(symbol)
  return { title: asset ? `${asset.symbol} · ${asset.name} — SHORTCOIN` : 'SHORTCOIN' }
}

export default async function TokenPage({ params }: Params) {
  const { symbol } = await params
  return <TokenSheet keyOrAddress={decodeURIComponent(symbol)} />
}
