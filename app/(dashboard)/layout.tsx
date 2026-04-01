import { Sidebar } from '@/components/ui/sidebar'
import { GlobePulse } from '@/components/ui/cobe-globe-pulse'
import { EtherealShadow } from '@/components/ui/ethereal-shadow'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ethereal shadow — top-left accent */}
      <div className="pointer-events-none fixed -left-[10vw] -top-[10vh] w-[60vw] h-[60vh] opacity-[0.12] z-0">
        <EtherealShadow
          color="rgba(99, 102, 241, 1)"
          animation={{ scale: 80, speed: 60 }}
          noise={{ opacity: 0.4, scale: 1.2 }}
        />
      </div>
      {/* Decorative globe background */}
      <div className="pointer-events-none fixed -right-[20vw] top-1/2 -translate-y-1/2 w-[70vw] max-w-[800px] opacity-[0.18] z-0">
        <GlobePulse speed={0.002} />
      </div>
      <Sidebar />
      <main className="relative z-10 md:ml-[240px] p-6 pb-20 md:pb-6">
        {children}
      </main>
    </div>
  )
}
