import type { ScoringStatus } from './types/database'

const PRIORITY_SECTORS = ['restaurant', 'resto', 'hôtel', 'hotel', 'artisan', 'commerce', 'boulangerie', 'coiffeur', 'plombier', 'électricien', 'menuisier', 'peintre', 'maçon', 'bar', 'café', 'traiteur', 'fleuriste', 'boucherie', 'garage']

interface PlacesData {
  website_url: string | null
  google_rating: number | null
  google_reviews_count: number
  sector: string | null
  google_maps_url: string | null
  googleProfileComplete: boolean
  indexedPages: number
}

interface AuditData {
  isResponsive: boolean
  lighthouseScore: number
  hasHttps: boolean
  hasMetaTags: boolean
  indexedPages: number
}

interface ScoreResult {
  score: number
  scoring_status: ScoringStatus
}

export function calculateScore(places: PlacesData, audit?: AuditData): ScoreResult {
  let score = 0
  const hasWebsite = !!places.website_url

  if (!hasWebsite) {
    score += 40
    if (places.google_reviews_count >= 50) score += 10
    if (places.google_rating && places.google_rating > 4.0) score += 5
    if (isPrioritySector(places.sector)) score += 5
    if (!places.googleProfileComplete) score += 10
    if (places.indexedPages < 5) score += 10
    return { score: Math.min(score, 100), scoring_status: 'complete' }
  }

  // Branche B Phase 1
  if (places.google_reviews_count >= 50) score += 10
  if (places.google_rating && places.google_rating > 4.0) score += 5
  if (isPrioritySector(places.sector)) score += 5

  if (!audit) {
    return { score: Math.min(score, 100), scoring_status: 'partial' }
  }

  // Phase 2
  if (!audit.isResponsive) score += 25
  if (audit.lighthouseScore < 50) score += 20
  if (!audit.hasHttps) score += 15
  if (!audit.hasMetaTags) score += 10
  if (audit.indexedPages < 5) score += 10
  if (!places.googleProfileComplete) score += 10

  return { score: Math.min(score, 100), scoring_status: 'complete' }
}

function isPrioritySector(sector: string | null): boolean {
  if (!sector) return false
  const lower = sector.toLowerCase()
  return PRIORITY_SECTORS.some(s => lower.includes(s))
}
