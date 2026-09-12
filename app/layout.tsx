import type { Metadata, Viewport } from 'next'
import { Inter, Syne } from 'next/font/google'
import './globals.css'
import { AppChrome } from '@/components/shell/app-chrome'

const ui = Inter({
  weight: ['300', '400', '500', '600'],
  variable: '--font-ui',
  subsets: ['latin'],
  display: 'swap',
})

const display = Syne({
  weight: ['500', '600', '700', '800'],
  variable: '--font-syne',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SHORTCOIN — buy, sell & short',
  description:
    'Buy, sell and short Robinhood Chain coins. Spot swaps, and pre-funded capped shorts with a knock-out barrier.',
}

export const viewport: Viewport = {
  themeColor: '#040405',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${ui.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-void text-ink">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  )
}
