-- Domain audit cache for Smart Scan (7-day TTL)
CREATE TABLE IF NOT EXISTS domain_audit_cache (
  domain       TEXT PRIMARY KEY,
  audit_data   JSONB NOT NULL,
  audited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Index to speed up expiry checks
CREATE INDEX IF NOT EXISTS domain_audit_cache_expires_at_idx ON domain_audit_cache (expires_at);

-- RLS: only service role can read/write
ALTER TABLE domain_audit_cache ENABLE ROW LEVEL SECURITY;

-- No public access — accessed only via service role key in API routes
