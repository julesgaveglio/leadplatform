import { getSectorPriority } from './sector-matrix'

// ─── City population tiers ────────────────────────────────────────────────────

const LARGE_CITIES = new Set([
  'paris',
  'marseille',
  'lyon',
])

const MEDIUM_CITIES = new Set([
  'toulouse',
  'nice',
  'nantes',
  'montpellier',
  'strasbourg',
  'bordeaux',
  'lille',
])

function getCityCompetitionBonus(city: string | null): number {
  if (!city) return 0
  const normalized = city.toLowerCase().trim()

  if (LARGE_CITIES.has(normalized)) return 20
  if (MEDIUM_CITIES.has(normalized)) return 10
  return 0
}

// ─── Reviews-count heuristic ──────────────────────────────────────────────────

function getReviewsCompetitionBonus(googleReviews: number): number {
  if (googleReviews > 200) return 30
  if (googleReviews > 100) return 20
  if (googleReviews > 50)  return 10
  if (googleReviews > 20)  return 5
  return 0
}

// ─── Sector base competition ──────────────────────────────────────────────────
// High-priority sectors (restaurants, personal services) tend to have more
// competition. We invert the priority score to derive a base competition value.

function getSectorCompetitionBase(sector: string | null): number {
  const priority = getSectorPriority(sector, null)
  // Higher priority sector → more saturated market → higher base competition.
  // Map priority range [40–90] → competition range [20–50].
  return Math.round(20 + ((priority - 40) / 50) * 30)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a competition score (0–100) for a local business.
 * Higher score = more competition = lower targeting priority.
 *
 * Components:
 *  - Sector base:    20–50 points (derived from sector matrix priority)
 *  - City size:       0–20 points (large / medium / small)
 *  - Reviews count:   0–30 points (proxy for market activity)
 */
export function scoreLocalCompetition(
  city: string | null,
  sector: string | null,
  googleReviews: number,
): number {
  const base = getSectorCompetitionBase(sector)
  const cityBonus = getCityCompetitionBonus(city)
  const reviewsBonus = getReviewsCompetitionBonus(googleReviews)

  return Math.min(100, base + cityBonus + reviewsBonus)
}

/**
 * Adjusts a base lead score downward when local competition is very high.
 * Deduction is up to 10 points, applied only when competition > 60.
 *
 * @param baseScore       Raw lead score (0–100)
 * @param competitionScore  Output of scoreLocalCompetition (0–100)
 * @returns Adjusted score, clamped to [0, 100]
 */
export function adjustScoreForCompetition(
  baseScore: number,
  competitionScore: number,
): number {
  if (competitionScore <= 60) return baseScore

  // Linear deduction: competition 61–100 → deduct 1–10 points
  const deduction = Math.round(((competitionScore - 60) / 40) * 10)
  return Math.max(0, Math.min(100, baseScore - deduction))
}
