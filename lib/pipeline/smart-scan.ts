import type { RawCompany, AuditResult, ScoredLead } from '../types/pipeline'
import { buildBusinessIntelligence } from '../intelligence/business'
import { adjustScoreForCompetition, scoreLocalCompetition } from '../intelligence/competition'
import { getDnsProvider } from '../auditors/dns'
import { checkSsl } from '../auditors/ssl'
import { getPageSpeed } from '../auditors/pagespeed'
import { detectCms } from '../auditors/wappalyzer'
import { takeScreenshot } from '../vision/screenshot'
import { scoreWithVision } from '../vision/scorer'
import { searchPappers } from '../scrapers/pappers'
import { searchGoogleMaps } from '../scrapers/serpapi'
import { scrapePagesJaunes } from '../scrapers/pagesjaunes'
import { deduplicateCompanies } from '../scrapers/deduplicator'
import { findEmail } from '../enrichment/hunter'
import { getCachedAudit, setCachedAudit, shouldAudit } from './cache'

// ─── Sectors & Cities ─────────────────────────────────────────────────────────

const SECTORS = [
  'plombier', 'électricien', 'menuisier', 'maçon', 'peintre en bâtiment',
  'coiffeur', 'institut de beauté', 'barbier',
  'restaurant', 'boulangerie', 'boucherie', 'pizzeria', 'traiteur',
  'garage automobile', 'carrosserie', 'vitrier', 'serrurier',
  'fleuriste', 'photographe', 'agent immobilier', 'expert comptable',
  'taxi', 'déménageur', 'nettoyage', 'pressing', 'cordonnerie',
]

const CITIES = [
  'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Montpellier',
  'Strasbourg', 'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Toulon',
  'Grenoble', 'Dijon', 'Angers', 'Nîmes', 'Le Mans', 'Brest',
  'Aix-en-Provence', 'Limoges', 'Tours', 'Amiens', 'Perpignan',
  'Metz', 'Besançon', 'Orléans', 'Caen', 'Mulhouse', 'Rouen',
  'Clermont-Ferrand', 'Nancy', 'Avignon', 'Poitiers', 'Pau',
]

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n)
}

// ─── Log callback type ────────────────────────────────────────────────────────

export type LogFn = (
  message: string,
  type?: 'info' | 'success' | 'error' | 'analyzing',
  extra?: Partial<{ progress: number; leads_found: number; leads_added: number }>
) => Promise<void>

// ─── Phase 1: Collect raw companies ──────────────────────────────────────────

export async function collectCompanies(
  sectors: string[],
  cities: string[],
  log: LogFn,
): Promise<RawCompany[]> {
  const all: RawCompany[] = []

  for (let i = 0; i < Math.min(sectors.length, cities.length); i++) {
    const sector = sectors[i]
    const city = cities[i]
    const query = `${sector} ${city}`

    try {
      // Source 1: Serper Google Maps (fast, reliable)
      const serperResults = await searchGoogleMaps(query)
      for (const p of serperResults) {
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
      await log(`✓ Serper: ${serperResults.length} résultats pour "${query}"`, 'success')

      // Source 2: Pages Jaunes (additional leads not on Google Maps)
      try {
        const pjResults = await scrapePagesJaunes(sector, city, 15)
        for (const p of pjResults) {
          all.push({
            name: p.name,
            phone: p.phone,
            address: p.address,
            city: p.city ?? city,
            sector: p.category ?? sector,
            naf_code: null,
            siret: null,
            website_url: p.website ?? null,
            google_maps_url: null,
            google_rating: null,
            google_reviews_count: 0,
            source: 'pagesjaunes',
          })
        }
        if (pjResults.length > 0) {
          await log(`✓ Pages Jaunes: ${pjResults.length} résultats pour "${sector} ${city}"`, 'success')
        }
      } catch {
        // PJ scraping optional — don't fail the whole scan
      }
    } catch (e: any) {
      await log(`✗ Erreur collecte "${query}": ${e.message}`, 'error')
    }
  }

  return all
}

// ─── Phase 2: Deduplicate & enrich with Pappers ───────────────────────────────

export async function enrichCompanies(
  raw: RawCompany[],
  log: LogFn,
): Promise<RawCompany[]> {
  // Deduplicate
  const deduped = deduplicateCompanies(raw) as RawCompany[]
  await log(`✓ Dédoublonnage: ${raw.length} → ${deduped.length} entreprises uniques`, 'info')

  // Enrich a sample with Pappers (rate-limited — only if key present)
  if (!process.env.PAPPERS_API_KEY) return deduped

  const toEnrich = deduped.slice(0, 30) // limit API calls
  for (const company of toEnrich) {
    try {
      const pappers = await searchPappers(company.name, company.city ?? undefined)
      if (pappers) {
        company.siret = pappers.siret
        company.naf_code = pappers.naf_code
        if (!company.phone && pappers.phone) company.phone = pappers.phone
        if (!company.website_url && pappers.website) company.website_url = pappers.website
      }
    } catch {
      // Silently skip failed Pappers lookups
    }
  }

  await log(`✓ Enrichissement Pappers terminé (${toEnrich.length} entreprises)`, 'info')
  return deduped
}

// ─── Phase 3: Audit a website ─────────────────────────────────────────────────

export async function auditWebsite(
  url: string,
  log: LogFn,
): Promise<AuditResult> {
  let domain = ''
  try {
    domain = new URL(url).hostname
  } catch {
    domain = url
  }

  // Check cache first
  if (!(await shouldAudit(domain))) {
    const cached = await getCachedAudit(domain)
    if (cached) {
      await log(`→ ${domain} (cache)`, 'info')
      return { ...cached, cached: true }
    }
  }

  await log(`→ Audit ${domain}...`, 'analyzing')

  // Run all auditors in parallel
  const [sslResult, dnsProvider, cmsResult, pageSpeedResult] = await Promise.allSettled([
    checkSsl(domain),
    getDnsProvider(domain),
    detectCms(url),
    getPageSpeed(url),
  ])

  const ssl = sslResult.status === 'fulfilled' ? sslResult.value : { valid: false, expiresAt: null }
  const dns = dnsProvider.status === 'fulfilled' ? dnsProvider.value : null
  const cms = cmsResult.status === 'fulfilled' ? cmsResult.value : { cms: null, technologies: [] }
  const pagespeed = pageSpeedResult.status === 'fulfilled' ? pageSpeedResult.value : null

  // Playwright audit for responsiveness + meta tags
  let isResponsive = false
  let hasMetaTags = false
  let hasSitemap = false
  let hasRobots = false
  let loadTimeMs = 0
  let indexedPages = 0

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (compatible; SmartAuditor/1.0)',
      })
      const page = await context.newPage()

      const start = Date.now()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
      loadTimeMs = Date.now() - start

      await page.setViewportSize({ width: 375, height: 812 })
      await page.waitForTimeout(400)
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth).catch(() => 800)
      isResponsive = scrollWidth <= 420

      hasMetaTags = await page.evaluate(() => {
        const title = document.querySelector('title')?.textContent?.trim()
        const desc = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim()
        return !!(title && title.length > 3 && desc && desc.length > 10)
      }).catch(() => false)
    } finally {
      await browser.close()
    }
  } catch {
    // Playwright failed — use defaults
  }

  // Check sitemap & robots
  try {
    const [sitemapRes, robotsRes] = await Promise.all([
      fetch(`${url.replace(/\/$/, '')}/sitemap.xml`, { method: 'HEAD', signal: AbortSignal.timeout(5000) }),
      fetch(`${url.replace(/\/$/, '')}/robots.txt`, { method: 'HEAD', signal: AbortSignal.timeout(5000) }),
    ])
    hasSitemap = sitemapRes.ok
    hasRobots = robotsRes.ok
  } catch { /* ignore */ }

  // Count indexed pages via Serper
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: `site:${domain}`, gl: 'fr', num: 10 }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const data = await res.json()
      indexedPages = data.searchInformation?.totalResults
        ? parseInt(data.searchInformation.totalResults.replace(/\D/g, ''), 10)
        : (data.organic?.length ?? 0)
    }
  } catch { /* ignore */ }

  // Vision screenshot (optional)
  let screenshotUrl: string | null = null
  let visionScore: number | null = null
  let visionNotes: string | null = null

  try {
    screenshotUrl = await takeScreenshot(url)
    if (screenshotUrl) {
      const vision = await scoreWithVision(screenshotUrl, domain)
      visionScore = vision.score
      visionNotes = vision.notes
    }
  } catch { /* vision optional */ }

  // Lighthouse score from load time
  let lighthouseScore: number
  if (loadTimeMs < 1500) lighthouseScore = 90
  else if (loadTimeMs < 3000) lighthouseScore = 70
  else if (loadTimeMs < 5000) lighthouseScore = 50
  else if (loadTimeMs < 8000) lighthouseScore = 30
  else lighthouseScore = 10

  const audit: AuditResult = {
    domain,
    has_https: ssl.valid,
    is_responsive: isResponsive,
    load_time_ms: loadTimeMs,
    lighthouse_score: pagespeed?.score ?? lighthouseScore,
    has_meta_tags: hasMetaTags,
    has_sitemap: hasSitemap,
    has_robots: hasRobots,
    cms: cms.cms,
    technologies: cms.technologies,
    indexed_pages: indexedPages,
    ssl_expires_at: ssl.expiresAt,
    dns_provider: dns,
    pagespeed_score: pagespeed?.score ?? null,
    screenshot_url: screenshotUrl,
    vision_score: visionScore,
    vision_notes: visionNotes,
    cached: false,
    audited_at: new Date().toISOString(),
  }

  // Cache result
  await setCachedAudit(domain, audit)

  return audit
}

// ─── Phase 4: Score a lead ────────────────────────────────────────────────────

function computeScore(company: RawCompany, audit: AuditResult | null, intel: ReturnType<typeof buildBusinessIntelligence>): number {
  let score = 0

  const hasWebsite = !!company.website_url

  if (!hasWebsite) {
    // No website = maximum opportunity
    score += 40
    score += Math.min(intel.priority_score * 0.3, 25) // sector priority
    if (company.google_reviews_count >= 50) score += 10
    if (company.google_rating && company.google_rating > 4.0) score += 5
    if (company.google_reviews_count < 5) score += 5 // no reviews = invisible online
    return Math.min(Math.round(score), 100)
  }

  // Has website: score based on quality issues
  if (audit) {
    if (!audit.is_responsive) score += 25
    if (audit.lighthouse_score < 50) score += 20
    if (!audit.has_https) score += 15
    if (!audit.has_meta_tags) score += 10
    if (audit.indexed_pages < 5) score += 10
    if (!audit.has_sitemap) score += 5
    if (!audit.has_robots) score += 3
    if (audit.vision_score && audit.vision_score > 60) score += Math.round((audit.vision_score - 60) * 0.3)
  }

  if (company.google_reviews_count >= 50) score += 8
  if (company.google_rating && company.google_rating > 4.0) score += 5
  score += Math.min(intel.priority_score * 0.15, 10)

  // Adjust for local competition
  const competitionScore = scoreLocalCompetition(company.city, company.sector, company.google_reviews_count)
  score = adjustScoreForCompetition(score, competitionScore)

  return Math.min(Math.round(score), 100)
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export interface SmartScanOptions {
  sectorCount?: number
  auditSites?: boolean
  enrichWithPappers?: boolean
  enrichWithHunter?: boolean
}

export async function runSmartScan(
  log: LogFn,
  options: SmartScanOptions = {},
): Promise<ScoredLead[]> {
  const {
    sectorCount = 10,
    auditSites = true,
    enrichWithPappers = true,
    enrichWithHunter = true,
  } = options

  // ── Step 1: Collect ──────────────────────────────────────────────────────
  await log('🔍 Collecte multi-sources...', 'info', { progress: 5 })
  const sectors = pickRandom(SECTORS, sectorCount)
  const cities = pickRandom(CITIES, sectorCount)

  const rawCompanies = await collectCompanies(sectors, cities, log)
  await log(`✓ ${rawCompanies.length} entreprises collectées`, 'success', { progress: 30, leads_found: rawCompanies.length })

  // ── Step 2: Deduplicate & Pappers enrichment ────────────────────────────
  await log('🔎 Dédoublonnage & enrichissement Pappers...', 'info', { progress: 32 })
  const enrichedCompanies = enrichWithPappers
    ? await enrichCompanies(rawCompanies, log)
    : (deduplicateCompanies(rawCompanies) as RawCompany[])

  await log(`✓ ${enrichedCompanies.length} entreprises uniques`, 'success', { progress: 45 })

  // ── Step 3: Build scored leads ──────────────────────────────────────────
  const scoredLeads: ScoredLead[] = []
  const companiesWithSites = enrichedCompanies.filter(c => !!c.website_url)
  const companiesWithoutSites = enrichedCompanies.filter(c => !c.website_url)

  // Companies without websites: quick score, no audit needed
  for (const company of companiesWithoutSites) {
    const intel = buildBusinessIntelligence(company)
    const score = computeScore(company, null, intel)
    scoredLeads.push({
      company_name: company.name,
      sector: company.sector,
      naf_code: company.naf_code,
      siret: company.siret,
      city: company.city,
      address: company.address,
      phone: company.phone,
      email: null,
      website_url: null,
      google_maps_url: company.google_maps_url,
      google_rating: company.google_rating,
      google_reviews_count: company.google_reviews_count,
      score,
      scoring_status: 'complete',
      audit: null,
      intelligence: intel,
    })
  }

  await log(`✓ ${companiesWithoutSites.length} leads sans site scorés`, 'info', { progress: 50 })

  // Companies with websites: audit if enabled
  if (auditSites && companiesWithSites.length > 0) {
    await log(`🔬 Audit de ${companiesWithSites.length} sites web...`, 'analyzing', { progress: 52 })
    const toAudit = companiesWithSites.slice(0, 40) // cap at 40 audits

    for (let i = 0; i < toAudit.length; i++) {
      const company = toAudit[i]
      const intel = buildBusinessIntelligence(company)

      let audit: AuditResult | null = null
      try {
        audit = await auditWebsite(company.website_url!, log)
        const issues = []
        if (!audit.is_responsive) issues.push('pas mobile')
        if (audit.lighthouse_score < 50) issues.push(`perf ${audit.lighthouse_score}/100`)
        if (!audit.has_https) issues.push('no HTTPS')
        if (!audit.has_meta_tags) issues.push('SEO vide')
        if (audit.indexed_pages < 5) issues.push(`${audit.indexed_pages} pages indexées`)
        if (audit.cms) issues.push(`CMS: ${audit.cms}`)

        if (issues.length > 0) {
          await log(`⚠ ${audit.domain} — ${issues.join(', ')}`, 'success')
        } else {
          await log(`✓ ${audit.domain} — site correct`, 'info')
        }
      } catch (e: any) {
        await log(`✗ Échec audit ${company.website_url}: ${e.message}`, 'error')
      }

      const score = computeScore(company, audit, intel)

      // Hunter email enrichment
      let email: string | null = null
      if (enrichWithHunter && audit?.domain) {
        try {
          email = await findEmail(audit.domain, company.name)
        } catch { /* optional */ }
      }

      scoredLeads.push({
        company_name: company.name,
        sector: company.sector,
        naf_code: company.naf_code,
        siret: company.siret,
        city: company.city,
        address: company.address,
        phone: company.phone,
        email,
        website_url: company.website_url,
        google_maps_url: company.google_maps_url,
        google_rating: company.google_rating,
        google_reviews_count: company.google_reviews_count,
        score,
        scoring_status: audit ? 'complete' : 'partial',
        audit,
        intelligence: intel,
      })

      const progress = 52 + Math.round((i / toAudit.length) * 40)
      await log('', 'info', { progress, leads_found: enrichedCompanies.length })
    }

    // Remaining companies with sites but not audited
    for (const company of companiesWithSites.slice(40)) {
      const intel = buildBusinessIntelligence(company)
      const score = computeScore(company, null, intel)
      scoredLeads.push({
        company_name: company.name,
        sector: company.sector,
        naf_code: company.naf_code,
        siret: company.siret,
        city: company.city,
        address: company.address,
        phone: company.phone,
        email: null,
        website_url: company.website_url,
        google_maps_url: company.google_maps_url,
        google_rating: company.google_rating,
        google_reviews_count: company.google_reviews_count,
        score,
        scoring_status: 'partial',
        audit: null,
        intelligence: intel,
      })
    }
  } else {
    // No audit — score all with sites as partial
    for (const company of companiesWithSites) {
      const intel = buildBusinessIntelligence(company)
      const score = computeScore(company, null, intel)
      scoredLeads.push({
        company_name: company.name,
        sector: company.sector,
        naf_code: company.naf_code,
        siret: company.siret,
        city: company.city,
        address: company.address,
        phone: company.phone,
        email: null,
        website_url: company.website_url,
        google_maps_url: company.google_maps_url,
        google_rating: company.google_rating,
        google_reviews_count: company.google_reviews_count,
        score,
        scoring_status: 'partial',
        audit: null,
        intelligence: intel,
      })
    }
  }

  // Sort by score descending
  scoredLeads.sort((a, b) => b.score - a.score)

  await log(`✓ ${scoredLeads.length} leads scorés`, 'success', { progress: 95, leads_found: scoredLeads.length })
  return scoredLeads
}
