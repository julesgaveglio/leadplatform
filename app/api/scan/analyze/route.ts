import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { analyzeSite } from '@/lib/scraper/site-analyzer'
import { calculateScore } from '@/lib/scoring'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { lead_id } = await request.json()
  if (!lead_id) {
    return NextResponse.json({ error: 'lead_id requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: lead } = await db.from('leads').select('*').eq('id', lead_id).single()

  if (!lead || !lead.website_url) {
    return NextResponse.json({ error: 'Lead ou site web non trouvé' }, { status: 404 })
  }

  try {
    const domain = new URL(lead.website_url).hostname
    const audit = await analyzeSite(lead.website_url, domain)

    // Recalculate score with audit data
    const scoreResult = calculateScore(
      {
        website_url: lead.website_url,
        google_rating: lead.google_rating,
        google_reviews_count: lead.google_reviews_count,
        sector: lead.sector,
        google_maps_url: lead.google_maps_url,
        googleProfileComplete: !!(lead.phone && lead.address),
        indexedPages: audit.indexedPages,
      },
      audit
    )

    await db.from('leads').update({
      score: scoreResult.score,
      scoring_status: 'complete',
    }).eq('id', lead_id)

    return NextResponse.json({ audit, score: scoreResult.score })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
