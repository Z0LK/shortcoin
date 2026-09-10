import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AppChrome } from '@/components/shell/app-chrome'

const ui = Inter({
  variable: '--font-ui',
  subsets: ['latin'],
  display: 'swap',
})

const numeric = JetBrains_Mono({
  variable: '--font-numeric',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SHORTCOIN — short any token',
  description:
    'The first trading terminal for tokenized equities on Robinhood Chain that lets you go short. Every chart can be inverted into a synthetic short instrument.',
}

export const viewport: Viewport = {
  themeColor: '#060709',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      data-mode="long"
      className={`${ui.variable} ${numeric.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-void text-ink">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  )
}
