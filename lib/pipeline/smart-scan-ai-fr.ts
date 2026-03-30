import type { RawCompany, ScoredLead } from '../types/pipeline'
import { buildBusinessIntelligence } from '../intelligence/business'
import { concurrentMap, type LogFn } from './smart-scan'
import { deduplicateCompanies } from '../scrapers/deduplicator'
import { findEmail } from '../enrichment/hunter'
import { searchGoogleMaps } from '../scrapers/serpapi'
import { scrapePagesJaunes } from '../scrapers/pagesjaunes'
import type { IndustryTier } from '../types/database'

// ─── FR AI Sectors (businesses that need automation, not a new site) ───────────

// Tier 1 — high budget, high automation ROI
const SECTORS_AI_FR_T1 = [
  // Services juridiques
  'avocat', 'cabinet avocat', 'notaire', 'huissier de justice',
  // Conseil B2B
  'cabinet conseil', 'expert-comptable', 'agence recrutement', 'consultant RH',
  // E-commerce
  'boutique en ligne', 'e-commerce', 'vente en ligne',
  // Amélioration habitat
  'architecte', 'rénovation intérieure', 'décoration intérieure', 'promoteur immobilier',
  // Santé / bien-être
  'cabinet médical', 'dentiste', 'kinésithérapeute', 'psychologue', 'coach sportif',
]

// Tier 2 — medium budget, good automation potential
const SECTORS_AI_FR_T2 = [
  // Agences & services pro
  'agence immobilière', 'agence communication', 'agence marketing digital',
  'agence web', 'formation professionnelle',
  // Commerce local établi
  'pharmacie', 'opticien', 'vétérinaire',
  // Artisanat haut de gamme
  'traiteur', 'chef cuisinier', 'chocolatier', 'bijoutier',
]

const ALL_SECTORS_AI_FR = [...SECTORS_AI_FR_T1, ...SECTORS_AI_FR_T2]

const CITIES_AI_FR = [
  // Grandes métropoles
  'Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg',
  'Montpellier', 'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Le Havre',
  // Villes secondaires dynamiques
  'Grenoble', 'Dijon', 'Angers', 'Nîmes', 'Toulon', 'Clermont-Ferrand',
  'Brest', 'Le Mans', 'Tours', 'Limoges', 'Metz', 'Besançon',
]

const PRIORITY_CITIES_AI_FR = new Set([
  'paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'bordeaux', 'lille',
])

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n)
}

// ─── Industry tier detection ──────────────────────────────────────────────────

function detectIndustryTier(sector: string | null): IndustryTier | null {
  if (!sector) return null
  const s = sector.toLowerCase()
  const isT1 = SECTORS_AI_FR_T1.some(t => s.includes(t.toLowerCase()))
  if (isT1) return 'tier_1'
  const isT2 = SECTORS_AI_FR_T2.some(t => s.includes(t.toLowerCase()))
  if (isT2) return 'tier_2'
  return null
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function computeScoreAIFr(company: RawCompany): number {
  // Auto IA only scores companies WITH a website
  if (!company.website_url) return 0

  let score = 0
  const tier = detectIndustryTier(company.sector)

  // Industry tier — primary signal
  if (tier === 'tier_1') score += 40
  else if (tier === 'tier_2') score += 20
  else score += 5

  // Social proof — active business signal
  const reviews = company.google_reviews_count ?? 0
  if (reviews >= 10) score += 20

  // Quality signal
  if (company.google_rating && company.google_rating >= 4.0) score += 10

  // City priority — larger market = more potential
  if (company.city && PRIORITY_CITIES_AI_FR.has(company.city.toLowerCase())) score += 10

  return Math.min(Math.round(score), 100)
}

// ─── Phase 1: Collect FR AI companies ─────────────────────────────────────────

async function collectCompaniesAIFr(
  sectors: string[],
  cities: string[],
  log: LogFn,
): Promise<RawCompany[]> {
  const all: RawCompany[] = []

  // Serper Google Maps
  for (let i = 0; i < Math.min(sectors.length, cities.length); i++) {
    const sector = sectors[i]
    const city = cities[i]
    const query = `${sector} ${city}`
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

  // Pages Jaunes (FR only — 3 concurrent Playwright browsers)
  const pjPairs = sectors.slice(0, 6).map((s, i) => ({ sector: s, city: cities[i % cities.length] }))
  await concurrentMap(pjPairs, async ({ sector, city }) => {
    try {
      const results = await scrapePagesJaunes(sector, city)
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
          google_maps_url: null,
          google_rating: null,
          google_reviews_count: 0,
          source: 'pagesjaunes',
        })
      }
      await log(`✓ PJ: ${results.length} results for "${sector}" in "${city}"`, 'success')
    } catch (e: any) {
      await log(`✗ PJ error "${sector}/${city}": ${e.message}`, 'error')
    }
  }, 3)

  return all
}

// ─── Main Auto IA FR orchestrator ─────────────────────────────────────────────

export interface SmartScanAIFrOptions {
  sectorCount?: number
  enrichWithHunter?: boolean
}

export async function runSmartScanAIFr(
  log: LogFn,
  options: SmartScanAIFrOptions = {},
): Promise<(ScoredLead & { industry: string | null; industry_tier: IndustryTier | null })[]> {
  const {
    sectorCount = 10,
    enrichWithHunter = true,
  } = options

  // Step 1: Collect
  await log('🔍 Collecting FR AI businesses (Serper + Pages Jaunes)...', 'info', { progress: 5 })
  const sectors = pickRandom(ALL_SECTORS_AI_FR, sectorCount)
  const cities = pickRandom(CITIES_AI_FR, sectorCount)

  const rawCompanies = await collectCompaniesAIFr(sectors, cities, log)
  await log(`✓ ${rawCompanies.length} companies collected`, 'success', { progress: 25, leads_found: rawCompanies.length })

  // Step 2: Deduplicate
  await log('🔎 Deduplication...', 'info', { progress: 27 })
  const dedupedCompanies = deduplicateCompanies(rawCompanies) as RawCompany[]
  await log(`✓ ${dedupedCompanies.length} unique companies`, 'success', { progress: 35 })

  // Step 3: Filter — Auto IA REQUIRES a website
  const companiesWithSites = dedupedCompanies.filter(c => !!c.website_url)
  const skipped = dedupedCompanies.length - companiesWithSites.length
  await log(`→ ${companiesWithSites.length} with website (${skipped} without skipped)`, 'info', { progress: 38 })

  // Step 4: Score (no audit — scoring is based on business signals, not site quality)
  const scoredLeads: (ScoredLead & { industry: string | null; industry_tier: IndustryTier | null })[] = []

  let emailsDone = 0
  await log(`📧 Enriching ${companiesWithSites.length} leads...`, 'analyzing', { progress: 40 })

  await concurrentMap(companiesWithSites, async (company) => {
    const intel = buildBusinessIntelligence(company)
    const score = computeScoreAIFr(company)
    const tier = detectIndustryTier(company.sector)

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
    const progress = 40 + Math.round((emailsDone / companiesWithSites.length) * 55)
    await log('', 'info', { progress, leads_found: companiesWithSites.length })
  }, 5)

  scoredLeads.sort((a, b) => b.score - a.score)

  await log(`✓ ${scoredLeads.length} AI leads scored`, 'success', { progress: 95, leads_found: scoredLeads.length })
  return scoredLeads
}
