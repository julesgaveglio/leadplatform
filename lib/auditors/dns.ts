// DNS lookup to get hosting/DNS provider name
// Uses Node.js dns/promises module (available in Next.js API routes)

import dns from 'dns/promises'

const PROVIDER_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /\.cloudflare\.com$/i, name: 'Cloudflare' },
  { pattern: /\.ovh\.net$/i, name: 'OVH' },
  { pattern: /\.domaincontrol\.com$/i, name: 'GoDaddy' },
  { pattern: /\.googledomains\.com$/i, name: 'Google Domains' },
  { pattern: /\.awsdns/i, name: 'AWS Route 53' },
  { pattern: /\.azure-dns\./i, name: 'Azure DNS' },
  { pattern: /\.hetzner\.com$/i, name: 'Hetzner' },
  { pattern: /\.gandi\.net$/i, name: 'Gandi' },
  { pattern: /\.namecheap\.com$/i, name: 'Namecheap' },
  { pattern: /\.name-services\.com$/i, name: 'Namecheap' },
  { pattern: /\.ionos\.com$/i, name: 'IONOS' },
  { pattern: /\.1and1\.com$/i, name: 'IONOS' },
  { pattern: /\.o2switch\.net$/i, name: 'o2switch' },
  { pattern: /\.infomaniak\.com$/i, name: 'Infomaniak' },
  { pattern: /\.online\.net$/i, name: 'Scaleway' },
  { pattern: /\.scaleway\.com$/i, name: 'Scaleway' },
  { pattern: /\.register\.com$/i, name: 'Register.com' },
  { pattern: /\.networksolutions\.com$/i, name: 'Network Solutions' },
  { pattern: /\.dnsimple\.com$/i, name: 'DNSimple' },
  { pattern: /\.nsone\.net$/i, name: 'NS1' },
  { pattern: /\.digitalocean\.com$/i, name: 'DigitalOcean' },
]

function detectProviderFromNs(nameserver: string): string | null {
  for (const { pattern, name } of PROVIDER_PATTERNS) {
    if (pattern.test(nameserver)) {
      return name
    }
  }
  return null
}

export async function getDnsProvider(domain: string): Promise<string | null> {
  try {
    // Strip any protocol/path from domain input
    const cleanDomain = domain
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
      .trim()

    const nameservers = await dns.resolveNs(cleanDomain)

    for (const ns of nameservers) {
      const provider = detectProviderFromNs(ns)
      if (provider) {
        return provider
      }
    }

    // Return the TLD of the first nameserver as a fallback hint
    if (nameservers.length > 0) {
      const parts = nameservers[0].split('.')
      if (parts.length >= 2) {
        return parts.slice(-2).join('.')
      }
    }

    return null
  } catch {
    return null
  }
}
