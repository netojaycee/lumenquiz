import type { Metadata } from 'next'
import './globals.css'
import { SoundProvider } from '@/components/SoundProvider'

export const metadata: Metadata = {
  title: 'Apoquiz',
  description: 'Live quiz competition platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <SoundProvider />
        {children}
      </body>
    </html>
  )
}
