import { Sidebar } from '@/components/ui/sidebar'
import { GlobePulse } from '@/components/ui/cobe-globe-pulse'
import { EtherealShadow } from '@/components/ui/ethereal-shadow'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ethereal shadow — top */}
      <div className="pointer-events-none fixed -top-[20%] -left-[10%] w-[80vw] h-[80vh] opacity-[0.25] z-0">
        <EtherealShadow
          color="rgba(99, 102, 241, 1)"
          animation={{ scale: 80, speed: 60 }}
          noise={{ opacity: 0.3, scale: 1.2 }}
        />
      </div>
      {/* Ethereal shadow — bottom right */}
      <div className="pointer-events-none fixed -bottom-[20%] -right-[10%] w-[80vw] h-[80vh] opacity-[0.2] z-0">
        <EtherealShadow
          color="rgba(79, 70, 229, 1)"
          animation={{ scale: 60, speed: 50 }}
          noise={{ opacity: 0.3, scale: 1.2 }}
        />
      </div>
      {/* Decorative globe background */}
      <div className="pointer-events-none fixed -right-[20vw] top-1/2 -translate-y-1/2 w-[70vw] max-w-[800px] opacity-[0.30] z-0">
        <GlobePulse speed={0.002} />
      </div>
      <Sidebar />
      <main className="relative z-10 md:ml-[240px] p-6 pb-20 md:pb-6">
        {children}
      </main>
    </div>
  )
}
