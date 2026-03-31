import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'
import { Users, DollarSign, XCircle, CheckCircle, PhoneCall, TrendingUp } from 'lucide-react'

export default async function StatsPage() {
  const supabase = await createClient()

  const { data: allLeads } = await supabase
    .from('leads')
    .select('assigned_to, status, sale_price')

  const stats = {
    jules: { total: 0, sold: 0, refused: 0, contacted: 0, revenue: 0 },
    ewan: { total: 0, sold: 0, refused: 0, contacted: 0, revenue: 0 },
  }

  allLeads?.forEach(lead => {
    const who = lead.assigned_to as 'jules' | 'ewan'
    if (!who || !stats[who]) return
    stats[who].total++
    if (lead.status === 'sold') {
      stats[who].sold++
      stats[who].revenue += lead.sale_price ?? 0
    } else if (lead.status === 'refused') {
      stats[who].refused++
    }
    if (['contacted', 'demo_sent', 'proposal_sent', 'sold'].includes(lead.status)) {
      stats[who].contacted++
    }
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Statistiques</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(['jules', 'ewan'] as const).map(name => {
          const s = stats[name]
          const conversionRate = s.total > 0 ? Math.round((s.sold / s.total) * 100) : 0
          return (
            <div key={name} className="card p-6 space-y-4">
              <h2 className="text-lg font-bold capitalize">{name}</h2>
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Leads assignés" value={s.total} icon={Users} />
                <StatCard label="Contactés" value={s.contacted} icon={PhoneCall} />
                <StatCard label="Validés (vendus)" value={s.sold} icon={CheckCircle} />
                <StatCard label="Refusés" value={s.refused} icon={XCircle} />
                <StatCard label="Taux de conversion" value={`${conversionRate}%`} icon={TrendingUp} />
                <StatCard label="CA total" value={`${s.revenue.toLocaleString('fr-FR')} €`} icon={DollarSign} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
