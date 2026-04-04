import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { getSiteUrl } from '@/lib/seo'
import './globals.css'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ExtConvert',
    template: '%s | ExtConvert',
  },
  description: 'Batch file conversion built with FastAPI and React.',
  generator: 'ExtConvert',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'ExtConvert',
    description: 'Batch file conversion built with FastAPI and React.',
    url: siteUrl,
    siteName: 'ExtConvert',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ExtConvert',
    description: 'Batch file conversion built with FastAPI and React.',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
