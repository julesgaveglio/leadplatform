export interface NafEntry {
  label: string
  priority: number
  avg_ticket: number | null
  seasonal: boolean
  tags: string[]
}

export const NAF_MATRIX: Record<string, NafEntry> = {
  '56': {
    label: 'Restauration',
    priority: 90,
    avg_ticket: 3500,
    seasonal: true,
    tags: ['restauration', 'B2C', 'urgent'],
  },
  '47': {
    label: 'Commerce de détail',
    priority: 75,
    avg_ticket: 2500,
    seasonal: true,
    tags: ['commerce', 'B2C'],
  },
  '96': {
    label: 'Services personnels (coiffure, beauté…)',
    priority: 85,
    avg_ticket: 2000,
    seasonal: false,
    tags: ['service', 'B2C', 'local'],
  },
  '43': {
    label: 'Travaux de construction spécialisés',
    priority: 80,
    avg_ticket: 5000,
    seasonal: true,
    tags: ['artisan', 'B2C', 'urgent'],
  },
  '45': {
    label: 'Commerce et réparation automobile',
    priority: 70,
    avg_ticket: 4000,
    seasonal: false,
    tags: ['auto', 'B2C'],
  },
  '49': {
    label: 'Transport terrestre / taxi',
    priority: 65,
    avg_ticket: 3000,
    seasonal: false,
    tags: ['transport', 'B2C'],
  },
  '68': {
    label: 'Activités immobilières',
    priority: 60,
    avg_ticket: 8000,
    seasonal: false,
    tags: ['immobilier', 'B2B/B2C'],
  },
  '69': {
    label: 'Activités juridiques et comptables',
    priority: 55,
    avg_ticket: 6000,
    seasonal: false,
    tags: ['conseil', 'B2B'],
  },
  '86': {
    label: 'Activités pour la santé humaine',
    priority: 50,
    avg_ticket: 2000,
    seasonal: false,
    tags: ['santé', 'B2C'],
  },
}

const DEFAULT_ENTRY: NafEntry = {
  label: 'Autre',
  priority: 40,
  avg_ticket: null,
  seasonal: false,
  tags: [],
}

/**
 * Looks up a NAF entry by the first 2 characters of the NAF code (division level).
 * Falls back to the default entry if no match is found.
 */
export function getNafEntry(nafCode: string): NafEntry {
  // NAF codes are like "5610A", "4711B" — match on first 2 digits (division)
  const prefix2 = nafCode.slice(0, 2)
  if (NAF_MATRIX[prefix2]) {
    return NAF_MATRIX[prefix2]
  }

  // Also try 4-char prefix in case the matrix is extended later
  const prefix4 = nafCode.slice(0, 4)
  for (const key of Object.keys(NAF_MATRIX)) {
    if (prefix4.startsWith(key)) {
      return NAF_MATRIX[key]
    }
  }

  return DEFAULT_ENTRY
}

/**
 * Returns a priority score (0–100) for a lead based on sector name or NAF code.
 * NAF code takes precedence over sector string when both are provided.
 */
export function getSectorPriority(sector: string | null, naf: string | null): number {
  if (naf) {
    return getNafEntry(naf).priority
  }

  if (sector) {
    const normalized = sector.toLowerCase()

    if (/restaurant|brasserie|pizz|traiteur|café|bar|snack|kebab|sushi/.test(normalized)) return 90
    if (/coiffeur|coiffure|esthétique|estheti|beauté|beaute|nail|spa|massage/.test(normalized)) return 85
    if (/plombier|plomberie|électricien|electricien|maçon|maconnerie|charpente|couvreur|carrelage|peintre|peinture|menuiserie|chauffage|climatisation/.test(normalized)) return 80
    if (/commerce|boutique|magasin|librairie|épicerie|epicerie|fleuriste|bijouterie/.test(normalized)) return 75
    if (/garage|mécanique|mecanique|carrosserie|auto/.test(normalized)) return 70
    if (/taxi|vtc|transport|livraison/.test(normalized)) return 65
    if (/immobilier|agence immobilière|promoteur/.test(normalized)) return 60
    if (/comptable|expertise comptable|avocat|notaire|juridique/.test(normalized)) return 55
    if (/médecin|medecin|dentiste|kiné|kinesithérapeute|pharmacie|infirmier|orthophoniste/.test(normalized)) return 50
  }

  return DEFAULT_ENTRY.priority
}

/**
 * Attempts to normalize a raw sector name using keyword matching.
 * Returns a canonical sector label or null if no match is found.
 */
export function detectSectorFromName(name: string, sector: string | null): string | null {
  const haystack = `${name} ${sector ?? ''}`.toLowerCase()

  if (/restaurant|brasserie|pizz|traiteur|café|bar\b|snack|kebab|sushi|crêperie|creperie|fast.?food/.test(haystack)) {
    return 'Restauration'
  }
  if (/coiffeur|coiffure|esthétique|estheti|beauté|beaute|nail\s*bar|spa\b|massage|institut/.test(haystack)) {
    return 'Services personnels'
  }
  if (/plombier|plomberie|électricien|electricien|maçon|maçonnerie|maconnerie|charpente|couvreur|carrelage|peintre|menuiserie|chauffage|climatisation|artisan/.test(haystack)) {
    return 'Construction & artisanat'
  }
  if (/commerce|boutique|magasin|librairie|épicerie|epicerie|fleuriste|bijouterie|retail/.test(haystack)) {
    return 'Commerce de détail'
  }
  if (/garage|mécanique|mecanique|carrosserie|auto/.test(haystack)) {
    return 'Automobile'
  }
  if (/taxi|vtc|transport|livraison|coursier/.test(haystack)) {
    return 'Transport'
  }
  if (/immobilier|agence immobilière|agence immobiliere|promoteur/.test(haystack)) {
    return 'Immobilier'
  }
  if (/comptable|expertise comptable|avocat|notaire|juridique|cabinet/.test(haystack)) {
    return 'Conseil & juridique'
  }
  if (/médecin|medecin|dentiste|kiné|kinésithérapeute|kinesithérapeute|pharmacie|infirmier|orthophoniste|santé|sante/.test(haystack)) {
    return 'Santé'
  }

  return sector ?? null
}
