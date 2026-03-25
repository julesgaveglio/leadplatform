import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { searchPlaces, parsePlaceToLead } from '@/lib/scraper/google-places'
import { calculateScore } from '@/lib/scoring'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { city, sector } = await request.json()
  if (!city || !sector) {
    return NextResponse.json({ error: 'Ville et secteur requis' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: runningJobs } = await db
    .from('scraping_jobs')
    .select('id')
    .eq('status', 'running')
    .limit(1)

  if (runningJobs && runningJobs.length > 0) {
    return NextResponse.json({ error: 'Un scan est déjà en cours' }, { status: 409 })
  }

  const { data: job, error: jobError } = await db
    .from('scraping_jobs')
    .insert({ query_city: city, query_sector: sector, status: 'running', progress: 0 })
    .select()
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Erreur création job' }, { status: 500 })
  }

  runScan(db, job.id, city, sector).catch(console.error)

  return NextResponse.json({ job_id: job.id })
}

async function runScan(db: any, jobId: string, city: string, sector: string) {
  try {
    await db.from('scraping_jobs').update({ progress: 10 }).eq('id', jobId)
    const places = await searchPlaces(city, sector)

    await db.from('scraping_jobs').update({ progress: 50, leads_found: places.length }).eq('id', jobId)

    let leadsAdded = 0
    for (let i = 0; i < places.length; i++) {
      const leadData = parsePlaceToLead(places[i], city, sector)
      const scoreResult = calculateScore({
        website_url: leadData.website_url,
        google_rating: leadData.google_rating,
        google_reviews_count: leadData.google_reviews_count,
        sector: leadData.sector,
        google_maps_url: leadData.google_maps_url,
        googleProfileComplete: !!(leadData.phone && leadData.address),
        indexedPages: 0,
      })

      const { error } = await db.from('leads').upsert(
        { ...leadData, score: scoreResult.score, scoring_status: scoreResult.scoring_status },
        { onConflict: 'google_maps_url', ignoreDuplicates: true }
      )

      if (!error) leadsAdded++

      const progress = 50 + Math.round((i / places.length) * 45)
      await db.from('scraping_jobs').update({ progress, leads_added: leadsAdded }).eq('id', jobId)
    }

    await db.from('scraping_jobs').update({ status: 'completed', progress: 100, leads_added: leadsAdded }).eq('id', jobId)
  } catch (error: any) {
    await db.from('scraping_jobs').update({ status: 'error', error_message: error.message }).eq('id', jobId)
  }
}
