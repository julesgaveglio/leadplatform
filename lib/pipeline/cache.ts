import { createServiceClient } from '@/lib/supabase/server'
import { AuditResult } from '../types/pipeline'

export async function getCachedAudit(domain: string): Promise<AuditResult | null> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('domain_audit_cache')
      .select('audit_data')
      .eq('domain', domain)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !data) return null
    return data.audit_data as AuditResult
  } catch {
    return null
  }
}

export async function setCachedAudit(domain: string, audit: AuditResult): Promise<void> {
  try {
    const supabase = createServiceClient()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { error } = await supabase
      .from('domain_audit_cache')
      .upsert(
        {
          domain,
          audit_data: audit,
          audited_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'domain' }
      )

    if (error) {
      console.error('[cache] Failed to set cached audit for domain:', domain, error)
    }
  } catch (err) {
    console.error('[cache] Unexpected error setting cached audit for domain:', domain, err)
  }
}

export async function shouldAudit(domain: string): Promise<boolean> {
  const cached = await getCachedAudit(domain)
  return cached === null
}
