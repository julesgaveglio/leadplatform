import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { scrapeBrand } from '@/lib/scraper/brand-scraper'
import { findOwnerName } from '@/lib/scraper/owner-finder'
import { generateColdPitch } from '@/lib/generator/pitch'
import { generateSite } from '@/lib/generator/claude-generate'
import { deployToVercel } from '@/lib/generator/vercel-deploy'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const db = createServiceClient()
  const { id } = params

  const { data: lead, error } = await db.from('leads').select('*').eq('id', id).single()
  if (error || !lead) return NextResponse.json({ error: 'Lead non trouvé' }, { status: 404 })

  const { data: generating } = await db
    .from('leads')
    .select('id')
    .in('demo_status', ['scraping', 'generating', 'deploying'])
    .limit(1)

  if (generating && generating.length > 0 && generating[0].id !== id) {
    return NextResponse.json({ error: 'Une génération est déjà en cours' }, { status: 409 })
  }

  await db.from('leads').update({ demo_status: 'scraping', demo_error_message: null }).eq('id', id)

  runPipeline(db, id, lead).catch(console.error)
  return NextResponse.json({ status: 'started' })
}

async function runPipeline(db: any, leadId: string, lead: any) {
  try {
    // ── Step 1 : Scrape brand + find owner (parallel) ──────────────────────
    const [brandData, ownerName] = await Promise.all([
      scrapeBrand(
        lead.company_name,
        lead.website_url,
        lead.google_maps_url,
        lead.phone,
        lead.address,
        lead.sector,
      ),
      findOwnerName(lead.company_name, lead.city, lead.siret ?? null),
    ])

    // ── Step 2 : Generate cold pitch ───────────────────────────────────────
    const issues: string[] = []
    if (!lead.website_url) {
      issues.push('aucun site internet')
    } else {
      // Build issues from scoring_status + score heuristic
      if (lead.score > 60) issues.push('site à améliorer')
    }

    const coldPitch = await generateColdPitch({
      ownerName,
      companyName: lead.company_name,
      sector: lead.sector,
      city: lead.city,
      googleRating: lead.google_rating,
      reviewsCount: lead.google_reviews_count,
      websiteUrl: lead.website_url,
      issues,
    })

    await db.from('leads').update({
      demo_status: 'generating',
      brand_data: brandData,
      owner_name: ownerName,
      cold_pitch: coldPitch,
    }).eq('id', leadId)

    // ── Step 3 : Generate site ─────────────────────────────────────────────
    const result = await generateSite(brandData)

    await db.from('leads').update({ demo_status: 'deploying' }).eq('id', leadId)

    // ── Step 4 : Deploy ────────────────────────────────────────────────────
    const deployment = await deployToVercel(lead.company_name, result.files)

    await db.from('leads').update({
      demo_status: 'deployed',
      demo_url: deployment.url,
      demo_generated_at: new Date().toISOString(),
    }).eq('id', leadId)

  } catch (error: any) {
    await db.from('leads').update({
      demo_status: 'error',
      demo_error_message: error.message?.slice(0, 500),
    }).eq('id', leadId)
  }
}
