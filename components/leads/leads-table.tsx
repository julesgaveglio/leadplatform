'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Lead } from '@/lib/types/database'
import { ScoreBadge } from '@/components/ui/score-badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Phone, ExternalLink, Search, Sparkles, Loader2, Check, RotateCcw } from 'lucide-react'

interface LeadsTableProps {
  leads: Lead[]
}

type EnrichState = 'idle' | 'running' | 'done' | 'error'

export function LeadsTable({ leads }: LeadsTableProps) {
  const [enrichStates, setEnrichStates] = useState<Record<string, EnrichState>>({})
  const [demoStatuses, setDemoStatuses] = useState<Record<string, Lead['demo_status']>>({})
  const [ownerNames, setOwnerNames] = useState<Record<string, string | null>>({})

  if (leads.length === 0) {
    return (
      <div className="card p-12 text-center text-text-secondary">
        Aucun lead trouvé. Lancez un scan pour commencer.
      </div>
    )
  }

  function getEnrichState(lead: Lead): EnrichState {
    if (enrichStates[lead.id]) return enrichStates[lead.id]
    if (lead.brand_data) return 'done'
    return 'idle'
  }

  function getDemoStatus(lead: Lead): Lead['demo_status'] {
    return demoStatuses[lead.id] ?? lead.demo_status
  }

  function getOwnerName(lead: Lead): string | null {
    return ownerNames[lead.id] !== undefined ? ownerNames[lead.id] : lead.owner_name
  }

  async function handleEnrich(lead: Lead) {
    setEnrichStates(s => ({ ...s, [lead.id]: 'running' }))
    const res = await fetch(`/api/leads/${lead.id}/enrich`, { method: 'POST' })
    if (!res.ok) { setEnrichStates(s => ({ ...s, [lead.id]: 'error' })); return }
    const interval = setInterval(async () => {
      const r = await fetch(`/api/leads/${lead.id}/status`)
      if (!r.ok) return
      const data = await r.json()
      if (data.demo_status !== 'scraping') {
        clearInterval(interval)
        setEnrichStates(s => ({ ...s, [lead.id]: 'done' }))
        setOwnerNames(s => ({ ...s, [lead.id]: data.owner_name }))
      }
    }, 2500)
  }

  async function handleGenerate(lead: Lead) {
    setDemoStatuses(s => ({ ...s, [lead.id]: 'generating' }))
    const res = await fetch(`/api/leads/${lead.id}/generate`, { method: 'POST' })
    if (!res.ok) { setDemoStatuses(s => ({ ...s, [lead.id]: 'error' })); return }
    const interval = setInterval(async () => {
      const r = await fetch(`/api/leads/${lead.id}/status`)
      if (!r.ok) return
      const data = await r.json()
      setDemoStatuses(s => ({ ...s, [lead.id]: data.demo_status }))
      if (!['generating', 'deploying'].includes(data.demo_status)) {
        clearInterval(interval)
        if (data.demo_status === 'deployed') window.location.reload()
      }
    }, 3000)
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary bg-bg-hover/50">
              {/* Score — toujours visible, fixe */}
              <th className="px-3 py-3 font-medium w-14 text-center">Score</th>

              {/* Entreprise — toujours visible, prend l'espace restant */}
              <th className="px-3 py-3 font-medium min-w-[160px]">Entreprise</th>

              {/* Secteur — masqué sur mobile */}
              <th className="px-3 py-3 font-medium hidden md:table-cell w-28">Secteur</th>

              {/* Ville — masqué sur mobile */}
              <th className="px-3 py-3 font-medium hidden sm:table-cell w-24">Ville</th>

              {/* Téléphone — masqué sur mobile */}
              <th className="px-3 py-3 font-medium hidden md:table-cell w-36">Téléphone</th>

              {/* Notes — visible uniquement sur grand écran */}
              <th className="px-3 py-3 font-medium hidden xl:table-cell">Notes</th>

              {/* Statut — toujours visible */}
              <th className="px-3 py-3 font-medium w-28">Statut</th>

              {/* Assigné — masqué sur petit écran */}
              <th className="px-3 py-3 font-medium hidden lg:table-cell w-20 text-center">Assigné</th>

              {/* Enrichir — toujours visible */}
              <th className="px-3 py-3 font-medium w-24 text-center">Enrichir</th>

              {/* Site démo — toujours visible */}
              <th className="px-3 py-3 font-medium w-28 text-center">Site démo</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const enrichState = getEnrichState(lead)
              const demoStatus = getDemoStatus(lead)
              const ownerName = getOwnerName(lead)
              const isDemoRunning = ['generating', 'deploying'].includes(demoStatus)
              const isEnriching = enrichState === 'running' || demoStatus === 'scraping'

              return (
                <tr key={lead.id} className="border-b border-border/40 hover:bg-bg-hover/60 transition-colors">

                  {/* Score */}
                  <td className="px-3 py-3 text-center">
                    <ScoreBadge score={lead.score} size={34} />
                  </td>

                  {/* Entreprise + owner */}
                  <td className="px-3 py-3">
                    <div>
                      <Link href={`/leads/${lead.id}`} className="font-medium hover:text-accent transition-colors">
                        {lead.company_name}
                      </Link>
                      {ownerName && (
                        <p className="text-xs text-text-secondary mt-0.5">👤 {ownerName}</p>
                      )}
                    </div>
                  </td>

                  {/* Secteur */}
                  <td className="px-3 py-3 hidden md:table-cell text-text-secondary capitalize text-xs">
                    {lead.sector ?? '—'}
                  </td>

                  {/* Ville */}
                  <td className="px-3 py-3 hidden sm:table-cell text-text-secondary text-xs">
                    {lead.city ?? '—'}
                  </td>

                  {/* Téléphone */}
                  <td className="px-3 py-3 hidden md:table-cell">
                    {lead.phone
                      ? (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-accent hover:underline text-xs">
                          <Phone size={12} />{lead.phone}
                        </a>
                      )
                      : <span className="text-text-secondary text-xs">—</span>}
                  </td>

                  {/* Notes */}
                  <td className="px-3 py-3 hidden xl:table-cell max-w-[220px]">
                    {lead.notes
                      ? <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{lead.notes}</p>
                      : <span className="text-text-secondary text-xs">—</span>}
                  </td>

                  {/* Statut */}
                  <td className="px-3 py-3">
                    <StatusBadge status={lead.status} />
                  </td>

                  {/* Assigné */}
                  <td className="px-3 py-3 hidden lg:table-cell text-center text-text-secondary text-xs capitalize">
                    {lead.assigned_to ?? '—'}
                  </td>

                  {/* Enrichir */}
                  <td className="px-3 py-3 text-center">
                    {isEnriching ? (
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <Loader2 size={12} className="animate-spin" />
                        <span className="hidden sm:inline">Analyse...</span>
                      </span>
                    ) : enrichState === 'done' ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-success flex items-center gap-1">
                          <Check size={12} />
                          <span className="hidden sm:inline">Enrichi</span>
                        </span>
                        <button
                          onClick={() => handleEnrich(lead)}
                          className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-0.5"
                        >
                          <RotateCcw size={10} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEnrich(lead)}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-border hover:bg-bg-hover rounded transition-colors whitespace-nowrap"
                      >
                        <Search size={12} />
                        <span className="hidden sm:inline">Enrichir</span>
                      </button>
                    )}
                  </td>

                  {/* Site démo */}
                  <td className="px-3 py-3 text-center">
                    {demoStatus === 'deployed' && lead.demo_url ? (
                      <a
                        href={lead.demo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-success hover:underline whitespace-nowrap"
                      >
                        <ExternalLink size={12} />
                        <span className="hidden sm:inline">Voir</span>
                      </a>
                    ) : isDemoRunning ? (
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <Loader2 size={12} className="animate-spin" />
                        <span className="hidden sm:inline">
                          {demoStatus === 'generating' ? 'IA...' : 'Deploy...'}
                        </span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleGenerate(lead)}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-accent hover:bg-accent-hover text-white rounded transition-colors whitespace-nowrap"
                      >
                        <Sparkles size={12} />
                        <span className="hidden sm:inline">Générer</span>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
