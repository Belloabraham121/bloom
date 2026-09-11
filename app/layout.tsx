import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google'

import './globals.css'
import '@openuidev/react-ui/index.css'
import { PrivyAuthProvider } from '@/components/privy-auth-provider'

const geist = Geist({ 
  subsets: ['latin'],
  variable: '--font-sans'
})
const geistMono = Geist_Mono({ 
  subsets: ['latin'],
  variable: '--font-mono'
})
const playfair = Playfair_Display({ 
  subsets: ['latin'],
  variable: '--font-serif'
})

export const metadata: Metadata = {
  title: 'See What Your Agent Sees',
  description:
    'Turn AI agent intent into live, interactive trading widgets. Real-time DEX telemetry, instant swaps, and visual intelligence—zero raw JSON.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${playfair.variable}`}>
      <body className="font-sans antialiased">
        <PrivyAuthProvider>{children}</PrivyAuthProvider>
      </body>
    </html>
  )
}
