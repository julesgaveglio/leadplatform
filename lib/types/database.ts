export type LeadStatus = 'to_call' | 'contacted' | 'demo_sent' | 'sold' | 'refused'
export type DemoStatus = 'idle' | 'scraping' | 'generating' | 'deploying' | 'deployed' | 'error'
export type ScoringStatus = 'partial' | 'complete'
export type JobStatus = 'pending' | 'running' | 'completed' | 'error'
export type AssignedTo = 'jules' | 'ewan'

export interface Lead {
  id: string
  created_at: string
  company_name: string
  sector: string | null
  city: string | null
  address: string | null
  phone: string | null
  website_url: string | null
  google_maps_url: string | null
  google_rating: number | null
  google_reviews_count: number
  score: number
  scoring_status: ScoringStatus
  status: LeadStatus
  assigned_to: AssignedTo | null
  sale_price: number | null
  notes: string | null
  demo_url: string | null
  demo_status: DemoStatus
  demo_error_message: string | null
  demo_generated_at: string | null
  last_contact_at: string | null
  brand_data: BrandData | null
  owner_name: string | null
  cold_pitch: string | null
}

export interface BrandData {
  name: string
  tagline: string | null
  description: string
  services: string[]
  values: string[]
  tone: 'professionnel' | 'chaleureux' | 'premium' | 'artisanal'
  colors: {
    primary: string
    secondary: string
    accent: string
  }
  logo_url: string | null
  images: string[]
  contact: {
    phone: string
    email: string | null
    address: string
    hours: string | null
  }
  social: {
    instagram: string | null
    facebook: string | null
  }
  reviews: Array<{
    text: string
    rating: number
    author: string
  }>
}

export interface ScanLogEntry {
  time: string
  message: string
  type: 'info' | 'success' | 'error' | 'analyzing'
}

export interface ScrapingJob {
  id: string
  created_at: string
  query_city: string
  query_sector: string
  status: JobStatus
  progress: number
  leads_found: number
  leads_added: number
  error_message: string | null
  current_action: string | null
  logs: ScanLogEntry[] | null
}
