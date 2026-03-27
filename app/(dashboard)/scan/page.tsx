'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ScrapingJob } from '@/lib/types/database'

export default function ScanPage() {
  const [job, setJob] = useState<ScrapingJob | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Restore active job on mount
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('scraping_jobs')
      .select('*')
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setJob(data[0])
          setScanning(true)
        }
      })
  }, [])

  // Poll while running
  useEffect(() => {
    if (!job || job.status !== 'running') return
    const supabase = createClient()
    const interval = setInterval(async () => {
      const { data } = await supabase.from('scraping_jobs').select('*').eq('id', job.id).single()
      if (data) {
        setJob(data)
        if (data.status !== 'running') setScanning(false)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [job?.id, job?.status])

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [job?.logs])

  async function handleScan() {
    setError(null)
    setScanning(true)
    setJob(null)
    const res = await fetch('/api/scan/smart', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error)
      setScanning(false)
      return
    }
    const supabase = createClient()
    const { data: newJob } = await supabase.from('scraping_jobs').select('*').eq('id', data.job_id).single()
    if (newJob) setJob(newJob)
  }

  const logs = job?.logs ?? []
  const isRunning = job?.status === 'running'
  const isDone = job?.status === 'completed'
  const isError = job?.status === 'error'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Scanner des prospects</h1>

      {/* Smart scan */}
      <div className="card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-medium">Smart Scan</p>
          <p className="text-sm text-text-secondary mt-1">
            Multi-sources (Serper + Pages Jaunes), audit complet (SSL, PageSpeed, CMS, vision IA), enrichissement email.
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="w-full sm:w-auto px-8 py-3 bg-accent hover:bg-accent-hover text-white rounded-md font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {scanning ? 'Scan en cours...' : '🚀 Lancer le scan'}
        </button>
      </div>

      {error && (
        <div className="card p-4 border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {/* Progress */}
      {job && (
        <div className="space-y-3">
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {isError && `Erreur : ${job.error_message}`}
                  {isDone && `Scan terminé — ${job.leads_added} leads ajoutés`}
                  {isRunning && (job.current_action ?? 'Scan en cours...')}
                </p>
                {isRunning && job.leads_found > 0 && (
                  <p className="text-xs text-text-secondary mt-0.5">
                    {job.leads_added} insérés · {job.leads_found} trouvés
                  </p>
                )}
              </div>
              <span className="font-mono text-sm text-text-secondary">{job.progress}%</span>
            </div>
            <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-accent'
                }`}
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>

          {/* Logs terminal */}
          {logs.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <span className="text-xs text-text-secondary font-mono ml-1">scan-log</span>
                {isRunning && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    live
                  </span>
                )}
              </div>
              <div className="p-4 h-64 overflow-y-auto font-mono text-xs space-y-1" style={{ background: '#050508' }}>
                {logs.map((entry, i) => {
                  const color =
                    entry.type === 'success' ? '#4ade80' :
                    entry.type === 'error' ? '#f87171' :
                    entry.type === 'analyzing' ? '#facc15' :
                    '#8888aa'
                  const prefix =
                    entry.type === 'success' ? '✓' :
                    entry.type === 'error' ? '✗' :
                    entry.type === 'analyzing' ? '→' : '·'
                  return (
                    <div key={i} className="flex gap-2">
                      <span style={{ color: '#8888aa', opacity: 0.5 }} className="shrink-0">
                        {new Date(entry.time).toLocaleTimeString('fr-FR')}
                      </span>
                      <span style={{ color }} className="shrink-0">{prefix}</span>
                      <span style={{ color }}>{entry.message}</span>
                    </div>
                  )
                })}
                {isRunning && <div className="text-accent animate-pulse">▋</div>}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
