import type { RawCompany, ScoredLead } from '../types/pipeline'
import { buildBusinessIntelligence } from '../intelligence/business'
import { concurrentMap, type LogFn } from './smart-scan'
import { deduplicateCompanies } from '../scrapers/deduplicator'
import { findEmail } from '../enrichment/hunter'
import { searchGoogleMaps } from '../scrapers/serpapi'
import type { IndustryTier } from '../types/database'

// ─── NZ AI Sectors ────────────────────────────────────────────────────────────

const SECTORS_AI_NZ_T1 = [
  // Professional services
  'lawyer', 'solicitor', 'accountant', 'chartered accountant', 'business consultant',
  'financial advisor', 'mortgage broker',
  // E-commerce / retail
  'online store', 'e-commerce', 'retail shop',
  // Health / wellness
  'GP clinic', 'dentist', 'physiotherapist', 'chiropractor', 'personal trainer', 'life coach',
]

const SECTORS_AI_NZ_T2 = [
  // Home services with established web presence
  'cleaning company', 'landscaping company', 'building company', 'plumbing company',
  // Hospitality / events
  'restaurant', 'cafe', 'catering company', 'event venue',
  // Education / coaching
  'tutoring', 'driving school', 'music school',
]

const ALL_SECTORS_AI_NZ = [...SECTORS_AI_NZ_T1, ...SECTORS_AI_NZ_T2]

const CITIES_AI_NZ = [
  'Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga',
  'Dunedin', 'Palmerston North', 'Nelson', 'Queenstown', 'New Plymouth',
]

const PRIORITY_CITIES_AI_NZ = new Set(['auckland', 'wellington', 'christchurch'])

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n)
}

function detectIndustryTierNZ(sector: string | null): IndustryTier | null {
  if (!sector) return null
  const s = sector.toLowerCase()
  const isT1 = SECTORS_AI_NZ_T1.some(t => s.includes(t.toLowerCase()))
  if (isT1) return 'tier_1'
  const isT2 = SECTORS_AI_NZ_T2.some(t => s.includes(t.toLowerCase()))
  if (isT2) return 'tier_2'
  return null
}

function computeScoreAINZ(company: RawCompany): number {
  if (!company.website_url) return 0

  let score = 0
  const tier = detectIndustryTierNZ(company.sector)

  if (tier === 'tier_1') score += 40
  else if (tier === 'tier_2') score += 20
  else score += 5

  // NZ threshold: 5 reviews (smaller market)
  const reviews = company.google_reviews_count ?? 0
  if (reviews >= 5) score += 20

  if (company.google_rating && company.google_rating >= 4.0) score += 10

  if (company.city && PRIORITY_CITIES_AI_NZ.has(company.city.toLowerCase())) score += 10

  return Math.min(Math.round(score), 100)
}

export interface SmartScanAINZOptions {
  sectorCount?: number
  enrichWithHunter?: boolean
}

export async function runSmartScanAINZ(
  log: LogFn,
  options: SmartScanAINZOptions = {},
): Promise<(ScoredLead & { industry: string | null; industry_tier: IndustryTier | null })[]> {
  const {
    sectorCount = 10,
    enrichWithHunter = true,
  } = options

  await log('🔍 Collecting NZ AI businesses (Serper Google Maps)...', 'info', { progress: 5 })
  const sectors = pickRandom(ALL_SECTORS_AI_NZ, sectorCount)
  const cities = pickRandom(CITIES_AI_NZ, sectorCount)

  // Collect
  const all: RawCompany[] = []
  for (let i = 0; i < Math.min(sectors.length, cities.length); i++) {
    const sector = sectors[i]
    const city = cities[i]
    const query = `${sector} ${city} New Zealand`
    try {
      const results = await searchGoogleMaps(query)
      for (const p of results) {
        all.push({
          name: p.name,
          phone: p.phone,
          address: p.address,
          city,
          sector,
          naf_code: null,
          siret: null,
          website_url: p.website ?? null,
          google_maps_url: p.googleMapsUrl,
          google_rating: p.rating,
          google_reviews_count: p.reviewsCount,
          source: 'serper',
        })
      }
      await log(`✓ Serper: ${results.length} results for "${query}"`, 'success')
    } catch (e: any) {
      await log(`✗ Collection error "${query}": ${e.message}`, 'error')
    }
  }

  await log(`✓ ${all.length} companies collected`, 'success', { progress: 30, leads_found: all.length })

  const dedupedCompanies = deduplicateCompanies(all) as RawCompany[]
  await log(`✓ ${dedupedCompanies.length} unique companies`, 'success', { progress: 40 })

  // Filter — Auto IA REQUIRES a website
  const companiesWithSites = dedupedCompanies.filter(c => !!c.website_url)
  const skipped = dedupedCompanies.length - companiesWithSites.length
  await log(`→ ${companiesWithSites.length} with website (${skipped} without skipped)`, 'info', { progress: 45 })

  const scoredLeads: (ScoredLead & { industry: string | null; industry_tier: IndustryTier | null })[] = []
  let emailsDone = 0

  await concurrentMap(companiesWithSites, async (company) => {
    const intel = buildBusinessIntelligence(company)
    const score = computeScoreAINZ(company)
    const tier = detectIndustryTierNZ(company.sector)

    let email: string | null = null
    if (enrichWithHunter && company.website_url) {
      try {
        const domain = new URL(company.website_url).hostname
        email = await findEmail(domain, company.name)
      } catch { /* optional */ }
    }

    scoredLeads.push({
      company_name: company.name,
      sector: company.sector,
      industry: company.sector,
      industry_tier: tier,
      naf_code: null,
      siret: null,
      city: company.city,
      address: company.address,
      phone: company.phone,
      email,
      website_url: company.website_url,
      google_maps_url: company.google_maps_url,
      google_rating: company.google_rating,
      google_reviews_count: company.google_reviews_count,
      score,
      scoring_status: 'complete',
      audit: null,
      intelligence: intel,
    })

    emailsDone++
    const progress = 45 + Math.round((emailsDone / companiesWithSites.length) * 50)
    await log('', 'info', { progress, leads_found: companiesWithSites.length })
  }, 5)

  scoredLeads.sort((a, b) => b.score - a.score)

  await log(`✓ ${scoredLeads.length} NZ AI leads scored`, 'success', { progress: 95, leads_found: scoredLeads.length })
  return scoredLeads
}
