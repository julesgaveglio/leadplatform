import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  trend?: string
}

export function StatCard({ label, value, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="card p-4 flex items-start gap-4">
      <div className="p-2 rounded-md bg-accent/10 text-accent">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-text-secondary text-sm">{label}</p>
        <p className="text-2xl font-bold font-mono mt-0.5">{value}</p>
        {trend && <p className="text-xs text-success mt-1">{trend}</p>}
      </div>
    </div>
  )
}
