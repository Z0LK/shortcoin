/**
 * Token lookup by contract address.
 *
 * A Route Handler rather than a client fetch: the RPC endpoint stays server-side
 * and there is no CORS negotiation with a public node on every keystroke.
 */

import { NextResponse } from 'next/server'
import { isAddress, readToken } from '@/lib/chain'
import { toPayload } from '@/lib/imported'
import { resolveAsset } from '@/lib/universe'
import { ASSETS } from '@/lib/assets'

/** Addresses of tokens we already carry, so a lookup can prefer the local one. */
const LOCAL_BY_ADDRESS = new Map(ASSETS.map((a) => [a.address.toLowerCase(), a.symbol]))

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')?.trim() ?? ''

  if (!isAddress(address)) {
    return NextResponse.json({ error: 'not-an-address' }, { status: 400 })
  }

  // If it is already listed, say so and send the user to the real page.
  const localSymbol = LOCAL_BY_ADDRESS.get(address.toLowerCase())
  if (localSymbol) {
    const asset = resolveAsset(localSymbol)
    if (asset) {
      return NextResponse.json({
        source: 'listed',
        symbol: asset.symbol,
        name: asset.name,
        address: asset.address,
      })
    }
  }

  const token = await readToken(address)
  if (!token) {
    return NextResponse.json({ error: 'not-a-token' }, { status: 404 })
  }

  return NextResponse.json({ source: 'chain', ...toPayload(token) })
}
