type Company = {
  name: string
  phone: string | null
  address: string | null
  city: string | null
  website_url: string | null
  google_maps_url: string | null
}

const LEGAL_FORMS = [
  'sarl', 'sas', 'sasu', 'eurl', 'sa', 'snc', 'sci', 'scop',
  'ei', 'eirl', 'scp', 'gie', 'association', 'assoc',
]

const LEGAL_FORMS_REGEX = new RegExp(
  `\\b(${LEGAL_FORMS.join('|')})\\b`,
  'gi',
)

const ACCENT_MAP: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  î: 'i', ï: 'i', í: 'i', ì: 'i',
  ô: 'o', ö: 'o', ó: 'o', ò: 'o', õ: 'o',
  ù: 'u', û: 'u', ü: 'u', ú: 'u',
  ç: 'c',
  ñ: 'n',
  œ: 'oe',
  æ: 'ae',
}

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .split('')
    .map((c) => ACCENT_MAP[c] ?? c)
    .join('')
    .replace(LEGAL_FORMS_REGEX, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s.\-()]/g, '')
}

export function deduplicateCompanies<T extends Company>(companies: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []

  for (const company of companies) {
    const keys: string[] = []

    // Key 1: google_maps_url (exact)
    if (company.google_maps_url) {
      keys.push(`maps:${company.google_maps_url}`)
    }

    // Key 2: normalized phone
    if (company.phone) {
      const normalizedPhone = normalizePhone(company.phone)
      if (normalizedPhone.length >= 6) {
        keys.push(`phone:${normalizedPhone}`)
      }
    }

    // Key 3: normalized name + city
    const normalizedName = normalizeCompanyName(company.name)
    const normalizedCity = (company.city ?? '')
      .toLowerCase()
      .split('')
      .map((c) => ACCENT_MAP[c] ?? c)
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    if (normalizedName) {
      keys.push(`name_city:${normalizedName}|${normalizedCity}`)
    }

    const isDuplicate = keys.some((key) => seen.has(key))
    if (!isDuplicate) {
      keys.forEach((key) => seen.add(key))
      result.push(company)
    }
  }

  return result
}
