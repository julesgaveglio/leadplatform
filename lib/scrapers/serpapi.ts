export interface SerperPlace {
  name: string
  phone: string | null
  address: string | null
  rating: number | null
  reviewsCount: number
  website: string | null
  googleMapsUrl: string | null
}

export async function searchGoogleMaps(
  query: string,
  location?: string,
): Promise<SerperPlace[]> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return []

  try {
    const body: Record<string, unknown> = {
      q: location ? `${query} ${location}` : query,
      gl: 'fr',
      hl: 'fr',
      num: 20,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    let response: Response
    try {
      response = await fetch('https://google.serper.dev/maps', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) return []

    const data = await response.json()
    const places: Record<string, unknown>[] = data.places ?? []

    return places.map((p) => ({
      name: String(p.title ?? p.name ?? ''),
      phone: (p.phoneNumber as string) ?? (p.phone as string) ?? null,
      address: (p.address as string) ?? null,
      rating: typeof p.rating === 'number' ? p.rating : null,
      reviewsCount: typeof p.ratingCount === 'number'
        ? p.ratingCount
        : typeof p.reviewsCount === 'number'
          ? p.reviewsCount
          : 0,
      website: (p.website as string) ?? null,
      googleMapsUrl: (p.cid as string)
        ? `https://maps.google.com/?cid=${p.cid}`
        : (p.link as string) ?? null,
    }))
  } catch {
    return []
  }
}
