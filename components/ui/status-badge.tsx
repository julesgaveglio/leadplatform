import type { LeadStatus } from '@/lib/types/database'

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  to_call: { label: 'À appeler', className: 'bg-accent/10 text-accent' },
  contacted: { label: 'Contacté', className: 'bg-warning/10 text-warning' },
  demo_sent: { label: 'Démo envoyée', className: 'bg-purple-500/10 text-purple-400' },
  sold: { label: 'Vendu', className: 'bg-success/10 text-success' },
  refused: { label: 'Refus', className: 'bg-danger/10 text-danger' },
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
