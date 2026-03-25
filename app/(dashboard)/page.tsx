import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'
import { Users, PhoneCall, DollarSign, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { count: totalLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true })

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: contactedThisWeek } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .gte('last_contact_at', weekAgo)

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data: soldThisMonth } = await supabase
    .from('leads')
    .select('sale_price')
    .eq('status', 'sold')
    .gte('created_at', monthStart)

  const salesCount = soldThisMonth?.length ?? 0
  const totalRevenue = soldThisMonth?.reduce((sum, l) => sum + (l.sale_price ?? 0), 0) ?? 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total leads" value={totalLeads ?? 0} icon={Users} />
        <StatCard label="Contactés cette semaine" value={contactedThisWeek ?? 0} icon={PhoneCall} />
        <StatCard label="Vendus ce mois" value={salesCount} icon={TrendingUp} />
        <StatCard label="CA ce mois" value={`${totalRevenue.toLocaleString('fr-FR')} €`} icon={DollarSign} />
      </div>
    </div>
  )
}
