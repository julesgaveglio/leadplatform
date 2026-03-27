// Uses: process.env.SERPER_API_KEY, process.env.PAPPERS_API_KEY

const EXCLUDED_WORDS = new Set([
  // Cities / regions
  'France', 'Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes', 'Lille',
  'Strasbourg', 'Montpellier', 'Rennes', 'Grenoble', 'Nice', 'Toulon', 'Saint',
  // Company legal forms
  'SARL', 'SAS', 'SASU', 'EURL', 'SNC', 'EIRL', 'SA', 'SCI', 'SCOP',
  // Months
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  // Common French words that look like names
  'Bonjour', 'Bonsoir', 'Monsieur', 'Madame', 'Mademoiselle', 'Président',
  'Directeur', 'Gérant', 'Fondateur', 'Propriétaire', 'Associé', 'Dirigeant',
  'Groupe', 'Centre', 'Grand', 'Grande', 'Nouveau', 'Nouvelle', 'Super',
  'Nord', 'Sud', 'Est', 'Ouest',
])

/**
 * Extracts a "Prénom Nom" pattern from a text string.
 * Returns the first match that looks like a real French person name.
 */
function extractNameFromText(text: string): string | null {
  // Match two consecutive capitalized words (2-15 chars each), not in excluded list
  const nameRegex = /\b([A-ZÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇ][a-záàâäéèêëíìîïóòôöúùûüçœ-]{1,14})\s+([A-ZÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇ][A-ZÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇa-záàâäéèêëíìîïóòôöúùûüçœ-]{1,14})\b/g

  let match: RegExpExecArray | null
  while ((match = nameRegex.exec(text)) !== null) {
    const firstName = match[1]
    const lastName = match[2]

    // Skip if either word is in the exclusion list
    if (EXCLUDED_WORDS.has(firstName) || EXCLUDED_WORDS.has(lastName)) continue

    // Skip all-uppercase words (acronyms)
    if (firstName === firstName.toUpperCase() || lastName === lastName.toUpperCase()) continue

    // Skip if lastName looks like a company name (contains digit or is very short)
    if (/\d/.test(lastName) || lastName.length < 2) continue

    return `${firstName} ${lastName}`
  }

  return null
}

interface PappersApiDirigeant {
  prenom?: string
  nom?: string
}

interface PappersApiEntreprise {
  dirigeants?: PappersApiDirigeant[]
}

interface PappersApiRechercheResult {
  dirigeants?: PappersApiDirigeant[]
}

interface PappersApiRecherche {
  resultats?: PappersApiRechercheResult[]
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function dirigeantToName(d: PappersApiDirigeant): string | null {
  if (!d) return null
  const parts = [d.prenom, d.nom].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

/** Fallback 1 — Pappers API */
async function tryPappers(
  companyName: string,
  city: string | null,
  siret: string | null,
): Promise<string | null> {
  const key = process.env.PAPPERS_API_KEY
  if (!key) return null

  // 1a. Direct SIRET lookup
  if (siret) {
    try {
      const url = `https://api.pappers.fr/v2/entreprise?siret=${encodeURIComponent(siret)}&api_token=${key}`
      const res = await fetchWithTimeout(url, {}, 8000)
      if (res.ok) {
        const data: PappersApiEntreprise = await res.json()
        const name = dirigeantToName(data?.dirigeants?.[0] ?? {})
        if (name) return name
      }
    } catch {
      // continue
    }
  }

  // 1b. Search by company name + city
  try {
    const q = encodeURIComponent(companyName)
    const loc = city ? `&localisation=${encodeURIComponent(city)}` : ''
    const url = `https://api.pappers.fr/v2/recherche?q=${q}${loc}&api_token=${key}`
    const res = await fetchWithTimeout(url, {}, 8000)
    if (res.ok) {
      const data: PappersApiRecherche = await res.json()
      const firstResult = data?.resultats?.[0]
      const name = dirigeantToName(firstResult?.dirigeants?.[0] ?? {})
      if (name) return name
    }
  } catch {
    // continue
  }

  return null
}

interface SerperKnowledgeGraph {
  attributes?: Record<string, string>
}

interface SerperAnswerBox {
  answer?: string
}

interface SerperOrganicResult {
  snippet?: string
  title?: string
}

interface SerperResponse {
  knowledgeGraph?: SerperKnowledgeGraph
  answerBox?: SerperAnswerBox
  organic?: SerperOrganicResult[]
}

const OWNER_KEYS = ['gérant', 'directeur', 'fondateur', 'propriétaire', 'dirigeant', 'president', 'président']

async function serperSearch(query: string): Promise<SerperResponse | null> {
  const key = process.env.SERPER_API_KEY
  if (!key) return null

  try {
    const res = await fetchWithTimeout(
      'https://google.serper.dev/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': key,
        },
        body: JSON.stringify({ q: query, gl: 'fr', hl: 'fr', num: 5 }),
      },
      8000,
    )
    if (!res.ok) return null
    return (await res.json()) as SerperResponse
  } catch {
    return null
  }
}

/** Fallback 2 — Serper knowledge graph / answerBox */
async function trySerperKnowledgeGraph(companyName: string, city: string | null): Promise<string | null> {
  const query = `"gérant" OR "directeur" OR "fondateur" "${companyName}" ${city ?? ''}`
  const data = await serperSearch(query)
  if (!data) return null

  // Check knowledgeGraph.attributes
  if (data.knowledgeGraph?.attributes) {
    const attrs = data.knowledgeGraph.attributes
    for (const key of Object.keys(attrs)) {
      if (OWNER_KEYS.some((k) => key.toLowerCase().includes(k))) {
        const value = attrs[key]
        const name = extractNameFromText(value)
        if (name) return name
        // Sometimes the value IS the name directly
        if (value && value.trim().split(' ').length >= 2) {
          const trimmed = value.trim()
          if (!EXCLUDED_WORDS.has(trimmed.split(' ')[0])) return trimmed
        }
      }
    }
  }

  // Check answerBox
  if (data.answerBox?.answer) {
    const name = extractNameFromText(data.answerBox.answer)
    if (name) return name
  }

  return null
}

/** Fallback 3 — Serper societe.com snippets */
async function trySerperSocieteCom(companyName: string, city: string | null): Promise<string | null> {
  const query = `site:societe.com "${companyName}" ${city ?? ''} dirigeant`
  const data = await serperSearch(query)
  if (!data?.organic) return null

  for (const result of data.organic.slice(0, 3)) {
    const text = [result.snippet, result.title].filter(Boolean).join(' ')
    const name = extractNameFromText(text)
    if (name) return name
  }

  return null
}

/** Fallback 4 — Serper generic patron/fondateur query */
async function trySerperGenericOwner(companyName: string, city: string | null): Promise<string | null> {
  const query = `patron fondateur gérant "${companyName}" ${city ?? ''}`
  const data = await serperSearch(query)
  if (!data?.organic) return null

  for (const result of data.organic.slice(0, 5)) {
    const text = [result.snippet, result.title].filter(Boolean).join(' ')
    const name = extractNameFromText(text)
    if (name) return name
  }

  return null
}

/**
 * Multi-source owner name finder for French businesses.
 * Returns "Prénom Nom" of the owner/director, or null if not found.
 *
 * Fallback chain:
 *   1. Pappers API (direct SIRET + name search)
 *   2. Serper — knowledge graph / answerBox
 *   3. Serper — societe.com snippets
 *   4. Serper — generic patron/fondateur query
 */
export async function findOwnerName(
  companyName: string,
  city: string | null,
  siret: string | null,
): Promise<string | null> {
  try {
    // 1. Pappers
    const pappersName = await tryPappers(companyName, city, siret)
    if (pappersName) return pappersName

    // 2. Serper knowledge graph
    const kgName = await trySerperKnowledgeGraph(companyName, city)
    if (kgName) return kgName

    // 3. Serper societe.com
    const societeName = await trySerperSocieteCom(companyName, city)
    if (societeName) return societeName

    // 4. Serper generic
    const genericName = await trySerperGenericOwner(companyName, city)
    if (genericName) return genericName

    return null
  } catch {
    return null
  }
}
