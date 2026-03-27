export async function findEmail(
  domain: string,
  companyName: string,
): Promise<string | null> {
  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey) return null

  try {
    const params = new URLSearchParams({
      domain,
      company: companyName,
      api_key: apiKey,
      limit: '1',
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)

    let response: Response
    try {
      response = await fetch(
        `https://api.hunter.io/v2/domain-search?${params.toString()}`,
        { signal: controller.signal },
      )
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) return null

    const json = await response.json()
    const emails: { value: string }[] = json?.data?.emails ?? []

    return emails[0]?.value ?? null
  } catch {
    return null
  }
}
