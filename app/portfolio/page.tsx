import { redirect } from 'next/navigation'

/** The portfolio screen became Positions when the product changed shape. */
export default function PortfolioPage() {
  redirect('/positions')
}
