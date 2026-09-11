import { ReceiptView } from '@/components/receipts/receipt-view'

export const metadata = { title: 'Reçu de règlement — SHORTCOIN' }

type Params = { params: Promise<{ id: string }> }

export default async function ReceiptPage({ params }: Params) {
  const { id } = await params
  return <ReceiptView positionId={decodeURIComponent(id)} />
}
