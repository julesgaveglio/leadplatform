'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import type { Lead } from '@/lib/types/database'
import { ScoreBadge } from '@/components/ui/score-badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Phone, ExternalLink, Sparkles, Loader2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'

interface LeadsTableProps {
  leads: Lead[]
}

export function LeadsTable({ leads }: LeadsTableProps) {
  const [statuses, setStatuses] = useState<Record<string, Lead['demo_status']>>({})
  const [expandedPitch, setExpandedPitch] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  if (leads.length === 0) {
    return (
      <div className="card p-12 text-center text-text-secondary">
        Aucun lead trouvé. Lancez un scan pour commencer.
      </div>
    )
  }

  function getStatus(lead: Lead): Lead['demo_status'] {
    return statuses[lead.id] ?? lead.demo_status
  }

  async function handleGenerate(lead: Lead) {
    setStatuses(s => ({ ...s, [lead.id]: 'scraping' }))
    const res = await fetch(`/api/leads/${lead.id}/generate`, { method: 'POST' })
    if (!res.ok) {
      setStatuses(s => ({ ...s, [lead.id]: 'error' }))
      return
    }
    // Poll until done
    const interval = setInterval(async () => {
      const r = await fetch(`/api/leads/${lead.id}/status`)
      if (!r.ok) return
      const data = await r.json()
      setStatuses(s => ({ ...s, [lead.id]: data.demo_status }))
      if (!['scraping', 'generating', 'deploying'].includes(data.demo_status)) {
        clearInterval(interval)
        // Reload to get fresh data (demo_url, pitch, owner)
        window.location.reload()
      }
    }, 3000)
  }

  function copyPitch(leadId: string, pitch: string) {
    navigator.clipboard.writeText(pitch)
    setCopied(leadId)
    setTimeout(() => setCopied(null), 2000)
  }

  const STEP_LABELS: Partial<Record<Lead['demo_status'], string>> = {
    scraping: 'Scraping...',
    generating: 'Génération IA...',
    deploying: 'Déploiement...',
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3 font-medium">Entreprise</th>
            <th className="px-4 py-3 font-medium">Secteur</th>
            <th className="px-4 py-3 font-medium">Ville</th>
            <th className="px-4 py-3 font-medium">Téléphone</th>
            <th className="px-4 py-3 font-medium">Statut</th>
            <th className="px-4 py-3 font-medium">Assigné</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const status = getStatus(lead)
            const isRunning = ['scraping', 'generating', 'deploying'].includes(status)
            const isDone = status === 'deployed'
            const hasPitch = !!lead.cold_pitch
            const pitchExpanded = expandedPitch === lead.id

            return (
              <Fragment key={lead.id}>
                <tr className="border-b border-border/50 hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <ScoreBadge score={lead.score} size={36} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      <Link href={`/leads/${lead.id}`} className="text-text-primary hover:text-accent font-medium">
                        {lead.company_name}
                      </Link>
                      {lead.owner_name && (
                        <p className="text-xs text-text-secondary">👤 {lead.owner_name}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary capitalize">{lead.sector}</td>
                  <td className="px-4 py-3 text-text-secondary">{lead.city}</td>
                  <td className="px-4 py-3">
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-accent hover:underline">
                        <Phone size={14} />
                        {lead.phone}
                      </a>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary capitalize">{lead.assigned_to ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Generate / site button */}
                      {isDone && lead.demo_url ? (
                        <a
                          href={lead.demo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-success hover:underline"
                        >
                          <ExternalLink size={13} />
                          Démo
                        </a>
                      ) : isRunning ? (
                        <span className="flex items-center gap-1 text-xs text-accent">
                          <Loader2 size={13} className="animate-spin" />
                          {STEP_LABELS[status]}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleGenerate(lead)}
                          className="flex items-center gap-1 text-xs px-2 py-1 bg-accent hover:bg-accent-hover text-white rounded transition-colors"
                        >
                          <Sparkles size={13} />
                          Générer
                        </button>
                      )}

                      {/* Pitch toggle */}
                      {hasPitch && (
                        <button
                          onClick={() => setExpandedPitch(pitchExpanded ? null : lead.id)}
                          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
                          title="Voir le pitch"
                        >
                          {pitchExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          Pitch
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Pitch row */}
                {hasPitch && pitchExpanded && (
                  <tr className="bg-accent/5 border-b border-border/50">
                    <td colSpan={8} className="px-6 py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-xs text-text-secondary mb-1 font-medium uppercase tracking-wide">Phrase d'accroche cold calling</p>
                          <p className="text-sm text-text-primary italic">&ldquo;{lead.cold_pitch}&rdquo;</p>
                        </div>
                        <button
                          onClick={() => copyPitch(lead.id, lead.cold_pitch!)}
                          className="flex items-center gap-1 text-xs px-2 py-1 bg-bg-hover hover:bg-border text-text-secondary rounded transition-colors shrink-0"
                        >
                          {copied === lead.id ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                          {copied === lead.id ? 'Copié' : 'Copier'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
