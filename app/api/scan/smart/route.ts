import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runSmartScan } from '@/lib/pipeline/smart-scan'
import type { LogFn } from '@/lib/pipeline/smart-scan'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const db = createServiceClient()

  // Block if a scan is already running
  const { data: runningJobs } = await db
    .from('scraping_jobs')
    .select('id')
    .eq('status', 'running')
    .limit(1)

  if (runningJobs && runningJobs.length > 0) {
    return NextResponse.json({ error: 'Un scan est déjà en cours' }, { status: 409 })
  }

  // Parse options from request body
  const body = await request.json().catch(() => ({}))
  const options = {
    sectorCount: body.sectorCount ?? 10,
    auditSites: body.auditSites ?? true,
    enrichWithPappers: body.enrichWithPappers ?? true,
    enrichWithHunter: body.enrichWithHunter ?? true,
  }

  // Create job
  const { data: job, error: jobError } = await db
    .from('scraping_jobs')
    .insert({
      query_city: 'Multi-villes',
      query_sector: 'Smart Scan',
      status: 'running',
      progress: 0,
      logs: [],
    })
    .select()
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: `Erreur création job: ${jobError?.message ?? 'job null'}` }, { status: 500 })
  }

  // Run asynchronously
  runSmartScanJob(db, job.id, options).catch(console.error)
  return NextResponse.json({ job_id: job.id })
}

// ─── Logging helper ────────────────────────────────────────────────────────────

async function makeLogger(db: ReturnType<typeof createServiceClient>, jobId: string): Promise<LogFn> {
  return async (message, type = 'info', extra) => {
    if (!message) {
      // Progress-only update
      if (extra) {
        await db.from('scraping_jobs').update(extra).eq('id', jobId)
      }
      return
    }
    const entry = { time: new Date().toISOString(), message, type }
    const { data } = await db.from('scraping_jobs').select('logs').eq('id', jobId).single()
    const logs = Array.isArray(data?.logs) ? [...data.logs] : []
    logs.push(entry)
    if (logs.length > 200) logs.splice(0, logs.length - 200)
    await db.from('scraping_jobs').update({ logs, current_action: message, ...extra }).eq('id', jobId)
  }
}

// ─── Main job runner ───────────────────────────────────────────────────────────

async function runSmartScanJob(
  db: ReturnType<typeof createServiceClient>,
  jobId: string,
  options: Parameters<typeof runSmartScan>[1],
) {
  const log = await makeLogger(db, jobId)

  try {
    await log('🚀 Smart Scan démarré...', 'info', { progress: 2 })

    const scoredLeads = await runSmartScan(log, options)

    await log(`📥 Insertion de ${scoredLeads.length} leads...`, 'info', { progress: 96 })

    let inserted = 0
    let duplicates = 0

    for (const lead of scoredLeads) {
      const { error } = await db.from('leads').insert({
        company_name: lead.company_name,
        sector: lead.sector,
        city: lead.city,
        address: lead.address,
        phone: lead.phone,
        website_url: lead.website_url,
        google_maps_url: lead.google_maps_url,
        google_rating: lead.google_rating,
        google_reviews_count: lead.google_reviews_count,
        score: lead.score,
        scoring_status: lead.scoring_status,
        status: 'to_call',
      })

      if (!error) {
        inserted++
      } else if (error.code === '23505') {
        duplicates++
      }
    }

    await log(
      `✅ Smart Scan terminé — ${inserted} leads ajoutés · ${duplicates} doublons`,
      'success',
      { progress: 100, leads_added: inserted, leads_found: scoredLeads.length }
    )

    await db.from('scraping_jobs').update({ status: 'completed' }).eq('id', jobId)

  } catch (err: any) {
    await log(`✗ Erreur fatale : ${err.message}`, 'error')
    await db.from('scraping_jobs').update({
      status: 'error',
      error_message: err.message,
    }).eq('id', jobId)
  }
}
