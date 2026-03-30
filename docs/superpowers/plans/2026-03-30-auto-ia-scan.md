# Auto IA Scan System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create two Auto IA scan pipelines (FR + NZ) targeting businesses WITH websites for automation upsell, plus update the scan page to 4-way navigation.

**Architecture:** Two new pipeline files (`smart-scan-ai-fr.ts`, `smart-scan-ai-nz.ts`) mirror the existing NZ pipeline structure but filter FOR companies with websites, score based on industry tier + review signals, and insert with `category: 'automation_ai'`. Two new API routes follow the existing route pattern. The scan page gains a second level of navigation (category × country).

**Tech Stack:** Next.js 14 App Router · Supabase · Serper (Google Maps) · Playwright (site audit) · TypeScript

---

## Chunk 1: Auto IA France pipeline

### Task 1: Create `lib/pipeline/smart-scan-ai-fr.ts`

**Files:**
- Create: `lib/pipeline/smart-scan-ai-fr.ts`

Key differences from `smart-scan.ts` (Site Web):
- Targets companies **WITH** websites (filter out those without)
- Scoring based on industry tier, review count, rating, city priority
- Inserts with `category: 'automation_ai'`, `industry`, `industry_tier` fields

- [ ] **Step 1: Create the file**

```typescript
import type { RawCompany, AuditResult, ScoredLead } from '../types/pipeline'
import { buildBusinessIntelligence } from '../intelligence/business'
import { auditWebsite, concurrentMap, type LogFn } from './smart-scan'
import { deduplicateCompanies } from '../scrapers/deduplicator'
import { findEmail } from '../enrichment/hunter'
import { searchGoogleMaps } from '../scrapers/serpapi'
import { searchPagesJaunes } from '../scrapers/pagesjaunes'
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
      const results = await searchPagesJaunes(sector, city)
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `smart-scan-ai-fr.ts`

- [ ] **Step 3: Commit**

```bash
cd "/Users/julesgaveglio/Ew X Jul"
git add lib/pipeline/smart-scan-ai-fr.ts
git commit -m "feat: add Auto IA France scan pipeline"
```

---

### Task 2: Create API route `app/api/scan/smart-ai-fr/route.ts`

**Files:**
- Create: `app/api/scan/smart-ai-fr/route.ts`

Mirrors `app/api/scan/smart-nz/route.ts` exactly but calls `runSmartScanAIFr` and inserts with `category: 'automation_ai'`, `country: 'fr'`, `industry`, `industry_tier`.

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/julesgaveglio/Ew X Jul"
git add "app/api/scan/smart-ai-fr/route.ts"
git commit -m "feat: add Auto IA France API route"
```

---

## Chunk 2: Auto IA NZ pipeline

### Task 3: Create `lib/pipeline/smart-scan-ai-nz.ts`

**Files:**
- Create: `lib/pipeline/smart-scan-ai-nz.ts`

NZ version — Serper only (no Pages Jaunes), min 5 reviews threshold, same tier structure.

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/julesgaveglio/Ew X Jul"
git add lib/pipeline/smart-scan-ai-nz.ts
git commit -m "feat: add Auto IA NZ scan pipeline"
```

---

### Task 4: Create API route `app/api/scan/smart-ai-nz/route.ts`

**Files:**
- Create: `app/api/scan/smart-ai-nz/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runSmartScanAINZ } from '@/lib/pipeline/smart-scan-ai-nz'
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
      query_city: 'Multi-cities NZ',
      query_sector: 'Auto IA 🇳🇿',
      status: 'running',
      progress: 0,
      logs: [],
    })
    .select()
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: `Job creation error: ${jobError?.message ?? 'job null'}` }, { status: 500 })
  }

  runSmartScanAINZJob(db, job.id, options).catch(console.error)
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

async function runSmartScanAINZJob(
  db: ReturnType<typeof createServiceClient>,
  jobId: string,
  options: Parameters<typeof runSmartScanAINZ>[1],
) {
  const log = await makeLogger(db, jobId)

  try {
    await log('🚀 Auto IA NZ scan started...', 'info', { progress: 2 })

    const scoredLeads = await runSmartScanAINZ(log, options)

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
        country: 'nz',
      }))
    )

    for (const r of insertResults) {
      if (r.status === 'fulfilled') {
        if (!r.value.error) inserted++
        else if (r.value.error.code === '23505') duplicates++
      }
    }

    await log(
      `✅ Auto IA NZ Scan complete — ${inserted} leads added · ${duplicates} duplicates`,
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/julesgaveglio/Ew X Jul"
git add "app/api/scan/smart-ai-nz/route.ts"
git commit -m "feat: add Auto IA NZ API route"
```

---

## Chunk 3: Scan page 4-way navigation

### Task 5: Update `app/(dashboard)/scan/page.tsx`

**Files:**
- Modify: `app/(dashboard)/scan/page.tsx`

Replace the 2-tab country selector with 2-level navigation (category × country), like the leads page. State: `category: 'site_web' | 'automation_ai'` + `country: 'fr' | 'nz'`.

- [ ] **Step 1: Replace the file content**

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ScrapingJob } from '@/lib/types/database'

type ScanCategory = 'site_web' | 'automation_ai'
type Country = 'fr' | 'nz'

const SCAN_CONFIG: Record<ScanCategory, Record<Country, {
  endpoint: string
  scanLabel: string
  description: string
}>> = {
  site_web: {
    fr: {
      endpoint: '/api/scan/smart',
      scanLabel: 'Lancer le scan Site Web France',
      description: 'Multi-sources (Serper + Pages Jaunes), audit complet (SSL, PageSpeed, CMS, vision IA), enrichissement email. Cible les entreprises sans site web.',
    },
    nz: {
      endpoint: '/api/scan/smart-nz',
      scanLabel: 'Lancer le scan Site Web NZ',
      description: 'Google Maps (Serper), audit complet, enrichissement email. Secteurs adaptés au marché NZ. Cible les entreprises sans site web.',
    },
  },
  automation_ai: {
    fr: {
      endpoint: '/api/scan/smart-ai-fr',
      scanLabel: 'Lancer le scan Auto IA France',
      description: 'Cible les entreprises avec site web dans les secteurs à fort potentiel IA (juridique, conseil, e-commerce, santé). Scoring par tier + avis Google.',
    },
    nz: {
      endpoint: '/api/scan/smart-ai-nz',
      scanLabel: 'Lancer le scan Auto IA NZ',
      description: 'Cible les entreprises NZ avec site web (professional services, e-commerce, santé). Scoring par tier + avis Google.',
    },
  },
}

const CATEGORY_TABS: { key: ScanCategory; icon: string; label: string }[] = [
  { key: 'site_web', icon: '🌐', label: 'Site Web' },
  { key: 'automation_ai', icon: '🤖', label: 'Automatisation IA' },
]

const GEO_TABS: { key: Country; flag: string; label: string }[] = [
  { key: 'fr', flag: '🇫🇷', label: 'France' },
  { key: 'nz', flag: '🇳🇿', label: 'Nouvelle-Zélande' },
]

export default function ScanPage() {
  const [category, setCategory] = useState<ScanCategory>('site_web')
  const [country, setCountry] = useState<Country>('fr')
  const [job, setJob] = useState<ScrapingJob | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const config = SCAN_CONFIG[category][country]

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
    const res = await fetch(config.endpoint, { method: 'POST' })
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

      {/* Level 1: Category */}
      <div className="card p-1 flex gap-1 w-fit">
        {CATEGORY_TABS.map(({ key, icon, label }) => {
          const isActive = category === key
          return (
            <button
              key={key}
              onClick={() => { setCategory(key); setError(null) }}
              disabled={scanning}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 ${
                isActive
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <span>{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          )
        })}
      </div>

      {/* Level 2: Geo */}
      <div className="flex gap-2">
        {GEO_TABS.map(({ key, flag, label }) => {
          const isActive = country === key
          return (
            <button
              key={key}
              onClick={() => { setCountry(key); setError(null) }}
              disabled={scanning}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border disabled:opacity-50 ${
                isActive
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <span>{flag}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          )
        })}
      </div>

      {/* Scan card */}
      <div className="card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-medium">
            {CATEGORY_TABS.find(t => t.key === category)?.icon}{' '}
            {CATEGORY_TABS.find(t => t.key === category)?.label}{' '}
            {GEO_TABS.find(t => t.key === country)?.flag}{' '}
            {GEO_TABS.find(t => t.key === country)?.label}
          </p>
          <p className="text-sm text-text-secondary mt-1">{config.description}</p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="w-full sm:w-auto px-8 py-3 bg-accent hover:bg-accent-hover text-white rounded-md font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {scanning ? 'Scan en cours...' : `🚀 ${config.scanLabel}`}
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/julesgaveglio/Ew X Jul"
git add "app/(dashboard)/scan/page.tsx"
git commit -m "feat: scan page 4-way navigation (Site Web / Auto IA × FR / NZ)"
```
