import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
})

export const metadata = {
  title: 'Ew X Jul — Prospection',
  description: 'Plateforme de prospection interne',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#0a0a0f] text-[#f0f0f0] font-[family-name:var(--font-space-grotesk)]">
        {children}
      </body>
    </html>
  )
}
