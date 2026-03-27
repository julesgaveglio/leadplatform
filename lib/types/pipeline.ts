export interface RawCompany {
  name: string
  phone: string | null
  address: string | null
  city: string | null
  sector: string | null
  naf_code: string | null
  siret: string | null
  website_url: string | null
  google_maps_url: string | null
  google_rating: number | null
  google_reviews_count: number
  source: 'apify' | 'pappers' | 'pagesjaunes' | 'serper'
}

export interface AuditResult {
  domain: string
  has_https: boolean
  is_responsive: boolean
  load_time_ms: number
  lighthouse_score: number
  has_meta_tags: boolean
  has_sitemap: boolean
  has_robots: boolean
  cms: string | null
  technologies: string[]
  indexed_pages: number
  ssl_expires_at: string | null
  dns_provider: string | null
  pagespeed_score: number | null
  screenshot_url: string | null
  vision_score: number | null
  vision_notes: string | null
  cached: boolean
  audited_at: string
}

export interface BusinessIntelligence {
  naf_label: string | null
  priority_score: number  // 0–100
  avg_ticket: number | null  // in euros
  has_seasonal_peak: boolean
  competition_level: 'low' | 'medium' | 'high'
  digital_maturity: 'none' | 'basic' | 'advanced'
  recommended_budget: number | null
  tags: string[]
}

export interface VisionResult {
  score: number  // 0–100 (higher = worse site = better lead)
  notes: string
  design_age: 'modern' | 'outdated' | 'very_outdated' | 'none'
  mobile_friendly: boolean
  issues: string[]
}

export interface ScoredLead {
  // Identification
  company_name: string
  sector: string | null
  naf_code: string | null
  siret: string | null
  city: string | null
  address: string | null
  phone: string | null
  email: string | null
  website_url: string | null
  google_maps_url: string | null
  google_rating: number | null
  google_reviews_count: number

  // Scoring
  score: number
  scoring_status: 'partial' | 'complete'

  // Enrichment data
  audit: AuditResult | null
  intelligence: BusinessIntelligence | null
}
