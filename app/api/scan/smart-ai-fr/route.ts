import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runSmartScanAIFr } from '@/lib/pipeline/smart-scan-ai-fr'
import type { LogFn } from '@/lib/pipeline/smart-scan'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  const { data: runningJobs } = await db
    .from('scraping_jobs')
    .select('id')
    .eq('status', 'running')
    .limit(1)

  if (runningJobs && runningJobs.length > 0) {
    return NextResponse.json({ error: 'A scan is already running' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const options = {
    sectorCount: body.sectorCount ?? 10,
    enrichWithHunter: body.enrichWithHunter ?? true,
  }

  const { data: job, error: jobError } = await db
    .from('scraping_jobs')
    .insert({
      query_city: 'Multi-villes FR',
      query_sector: 'Auto IA 🇫🇷',
      status: 'running',
      progress: 0,
      logs: [],
    })
    .select()
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: `Job creation error: ${jobError?.message ?? 'job null'}` }, { status: 500 })
  }

  runSmartScanAIFrJob(db, job.id, options).catch(console.error)
  return NextResponse.json({ job_id: job.id })
}

async function makeLogger(db: ReturnType<typeof createServiceClient>, jobId: string): Promise<LogFn> {
  return async (message, type = 'info', extra) => {
    if (!message) {
      if (extra) await db.from('scraping_jobs').update(extra).eq('id', jobId)
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

async function runSmartScanAIFrJob(
  db: ReturnType<typeof createServiceClient>,
  jobId: string,
  options: Parameters<typeof runSmartScanAIFr>[1],
) {
  const log = await makeLogger(db, jobId)

  try {
    await log('🚀 Auto IA France scan started...', 'info', { progress: 2 })

    const scoredLeads = await runSmartScanAIFr(log, options)

    await log(`📥 Inserting ${scoredLeads.length} leads...`, 'info', { progress: 96 })

    let inserted = 0
    let duplicates = 0

    const insertResults = await Promise.allSettled(
      scoredLeads.map(lead => db.from('leads').insert({
        company_name: lead.company_name,
        sector: lead.sector,
        industry: lead.industry,
        industry_tier: lead.industry_tier,
        city: lead.city,
        address: lead.address,
        phone: lead.phone,
        email: lead.email,
        website_url: lead.website_url,
        google_maps_url: lead.google_maps_url,
        google_rating: lead.google_rating,
        google_reviews_count: lead.google_reviews_count,
        score: lead.score,
        scoring_status: lead.scoring_status,
        status: 'to_call',
        category: 'automation_ai',
        country: 'fr',
      }))
    )

    for (const r of insertResults) {
      if (r.status === 'fulfilled') {
        if (!r.value.error) inserted++
        else if (r.value.error.code === '23505') duplicates++
      }
    }

    await log(
      `✅ Auto IA FR Scan complete — ${inserted} leads added · ${duplicates} duplicates`,
      'success',
      { progress: 100, leads_added: inserted, leads_found: scoredLeads.length }
    )

    await db.from('scraping_jobs').update({ status: 'completed' }).eq('id', jobId)

  } catch (err: any) {
    await log(`✗ Fatal error: ${err.message}`, 'error')
    await db.from('scraping_jobs').update({
      status: 'error',
      error_message: err.message,
    }).eq('id', jobId)
  }
}
