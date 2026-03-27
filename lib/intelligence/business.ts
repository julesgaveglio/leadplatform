import { getNafEntry, getSectorPriority } from './sector-matrix'
import type { RawCompany, BusinessIntelligence } from '../types/pipeline'

export function buildBusinessIntelligence(company: RawCompany): BusinessIntelligence {
  const nafEntry = company.naf_code ? getNafEntry(company.naf_code) : null
  const priority = getSectorPriority(company.sector, company.naf_code)

  // Estimate digital maturity from existing data
  let digital_maturity: BusinessIntelligence['digital_maturity'] = 'none'
  if (company.website_url) {
    digital_maturity = 'basic'
  }

  // Competition level based on reviews count
  let competition_level: BusinessIntelligence['competition_level'] = 'low'
  if (company.google_reviews_count > 100) competition_level = 'high'
  else if (company.google_reviews_count > 30) competition_level = 'medium'

  // Recommended budget based on sector avg ticket
  const avg_ticket = nafEntry?.avg_ticket ?? null
  const recommended_budget = avg_ticket ? Math.round(avg_ticket * 0.15) : null

  return {
    naf_label: nafEntry?.label ?? null,
    priority_score: priority,
    avg_ticket,
    has_seasonal_peak: nafEntry?.seasonal ?? false,
    competition_level,
    digital_maturity,
    recommended_budget,
    tags: nafEntry?.tags ?? [],
  }
}
