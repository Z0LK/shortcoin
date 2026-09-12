import type { Metadata, Viewport } from 'next'
import { DM_Mono, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { AppChrome } from '@/components/shell/app-chrome'

const ui = Space_Grotesk({
  variable: '--font-ui',
  subsets: ['latin'],
  display: 'swap',
})

const numeric = DM_Mono({
  weight: ['300', '400', '500'],
  variable: '--font-numeric',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SHORTCOIN — short any token',
  description:
    'The short-only trading terminal for Robinhood Chain coins. Pre-funded, capped shorts with a knock-out barrier.',
}

export const viewport: Viewport = {
  themeColor: '#05060e',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${ui.variable} ${numeric.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-void text-ink">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  )
}
