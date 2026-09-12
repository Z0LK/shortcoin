import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import { AppChrome } from '@/components/shell/app-chrome'

const ui = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  subsets: ['latin'],
  display: 'swap',
})

const numeric = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
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
