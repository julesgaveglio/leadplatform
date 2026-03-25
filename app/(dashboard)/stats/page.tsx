import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'
import { Users, DollarSign } from 'lucide-react'

export default async function StatsPage() {
  const supabase = await createClient()

  const { data: allSold } = await supabase
    .from('leads')
    .select('assigned_to, sale_price')
    .eq('status', 'sold')

  const stats = {
    jules: { count: 0, revenue: 0 },
    ewan: { count: 0, revenue: 0 },
  }

  allSold?.forEach(lead => {
    const who = lead.assigned_to as 'jules' | 'ewan'
    if (who && stats[who]) {
      stats[who].count++
      stats[who].revenue += lead.sale_price ?? 0
    }
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Statistiques</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(['jules', 'ewan'] as const).map(name => (
          <div key={name} className="card p-6 space-y-4">
            <h2 className="text-lg font-bold capitalize">{name}</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Ventes" value={stats[name].count} icon={Users} />
              <StatCard label="CA total" value={`${stats[name].revenue.toLocaleString('fr-FR')} €`} icon={DollarSign} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
