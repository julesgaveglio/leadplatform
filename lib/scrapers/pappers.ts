export interface PappersCompany {
  siret: string
  naf_code: string
  naf_label: string
  address: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
  email: string | null
  website: string | null
  created_at: string | null
  employee_count: string | null
}

const BASE_URL = 'https://api.pappers.fr/v2'

export async function searchPappers(
  companyName: string,
  city?: string,
): Promise<PappersCompany | null> {
  const apiKey = process.env.PAPPERS_API_KEY
  if (!apiKey) return null

  try {
    const params = new URLSearchParams({
      q: companyName,
      api_token: apiKey,
    })
    if (city) params.set('localisation', city)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    let response: Response
    try {
      response = await fetch(`${BASE_URL}/entreprise?${params.toString()}`, {
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) return null

    const data = await response.json()
    const results: Record<string, unknown>[] = data.resultats ?? data.entreprises ?? []

    if (!results.length) return null

    const r = results[0] as Record<string, unknown>

    const siege = (r.siege ?? r.etablissement_siege ?? {}) as Record<string, unknown>

    return {
      siret: String(r.siret ?? siege['siret'] ?? ''),
      naf_code: String(r.code_naf ?? r.activite_principale ?? ''),
      naf_label: String(r.libelle_code_naf ?? r.libelle_activite_principale ?? ''),
      address: (siege['adresse_ligne_1'] as string) ?? (siege['adresse'] as string) ?? null,
      city: (siege['ville'] as string) ?? null,
      postal_code: (siege['code_postal'] as string) ?? null,
      phone: (r.telephone as string) ?? null,
      email: (r.email as string) ?? null,
      website: (r.site_web as string) ?? null,
      created_at: (r.date_creation as string) ?? null,
      employee_count: (r.tranche_effectif as string) ?? (r.effectif as string) ?? null,
    }
  } catch {
    return null
  }
}
