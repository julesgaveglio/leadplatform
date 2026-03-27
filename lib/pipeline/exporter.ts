import { ScoredLead } from '../types/pipeline'

const CSV_COLUMNS: (keyof Pick<
  ScoredLead,
  | 'company_name'
  | 'sector'
  | 'city'
  | 'phone'
  | 'email'
  | 'website_url'
  | 'google_rating'
  | 'google_reviews_count'
  | 'score'
> & string)[] = [
  'company_name',
  'sector',
  'city',
  'phone',
  'email',
  'website_url',
  'google_rating',
  'google_reviews_count',
  'score',
]

const CSV_HEADERS = [
  'company_name',
  'sector',
  'city',
  'phone',
  'email',
  'website_url',
  'google_rating',
  'google_reviews_count',
  'score',
  'cms',
  'indexed_pages',
  'has_https',
  'is_responsive',
  'naf_code',
  'siret',
]

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Wrap in quotes if the value contains a comma, double quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportToCsv(leads: ScoredLead[]): string {
  const headerRow = CSV_HEADERS.map(escapeCsvValue).join(',')

  const rows = leads.map((lead) => {
    const fields = [
      lead.company_name,
      lead.sector,
      lead.city,
      lead.phone,
      lead.email,
      lead.website_url,
      lead.google_rating,
      lead.google_reviews_count,
      lead.score,
      lead.audit?.cms ?? null,
      lead.audit?.indexed_pages ?? null,
      lead.audit?.has_https ?? null,
      lead.audit?.is_responsive ?? null,
      lead.naf_code,
      lead.siret,
    ]
    return fields.map(escapeCsvValue).join(',')
  })

  return [headerRow, ...rows].join('\n')
}

export function exportToJson(leads: ScoredLead[]): string {
  return JSON.stringify(leads, null, 2)
}

export function getExportFilename(format: 'csv' | 'json'): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `smart-leads-${year}-${month}-${day}.${format}`
}
