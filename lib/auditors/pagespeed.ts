// Google PageSpeed Insights API (free, no key required for basic use)

export interface PageSpeedResult {
  score: number
  fcp: number
  lcp: number
}

export async function getPageSpeed(url: string): Promise<PageSpeedResult | null> {
  try {
    const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
    apiUrl.searchParams.set('url', url)
    apiUrl.searchParams.set('strategy', 'mobile')
    apiUrl.searchParams.set('category', 'performance')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let response: Response
    try {
      response = await fetch(apiUrl.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    const lighthouseResult = data?.lighthouseResult
    if (!lighthouseResult) {
      return null
    }

    const rawScore: number | undefined =
      lighthouseResult?.categories?.performance?.score

    const fcpValue: number | undefined =
      lighthouseResult?.audits?.['first-contentful-paint']?.numericValue

    const lcpValue: number | undefined =
      lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue

    if (rawScore == null || fcpValue == null || lcpValue == null) {
      return null
    }

    return {
      score: Math.round(rawScore * 100),
      fcp: Math.round(fcpValue),
      lcp: Math.round(lcpValue),
    }
  } catch {
    return null
  }
}
