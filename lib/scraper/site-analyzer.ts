export interface SiteAuditResult {
  isResponsive: boolean
  lighthouseScore: number
  hasHttps: boolean
  hasMetaTags: boolean
  indexedPages: number
}

export async function analyzeSite(websiteUrl: string, domain: string): Promise<SiteAuditResult> {
  const [browserAudit, indexedPages] = await Promise.all([
    auditWithPlaywright(websiteUrl),
    checkIndexedPages(domain),
  ])

  return {
    ...browserAudit,
    indexedPages,
  }
}

async function auditWithPlaywright(url: string): Promise<Omit<SiteAuditResult, 'indexedPages'>> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()

    // Check HTTPS
    const hasHttps = url.startsWith('https://')

    // Load page and measure performance
    const startTime = Date.now()
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
    const loadTime = Date.now() - startTime

    // Simple performance score based on load time (rough Lighthouse approximation)
    let lighthouseScore: number
    if (loadTime < 2000) lighthouseScore = 90 + Math.round((2000 - loadTime) / 200)
    else if (loadTime < 4000) lighthouseScore = 60 + Math.round((4000 - loadTime) / 67)
    else if (loadTime < 6000) lighthouseScore = 30 + Math.round((6000 - loadTime) / 67)
    else lighthouseScore = Math.max(0, 30 - Math.round((loadTime - 6000) / 200))

    // Check responsive
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(1000)
    const mobileWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const isResponsive = mobileWidth <= 400

    // Check meta tags
    const hasMetaTags = await page.evaluate(() => {
      const title = document.querySelector('title')
      const description = document.querySelector('meta[name="description"]')
      return !!(title?.textContent && description?.getAttribute('content'))
    })

    return { isResponsive, lighthouseScore: Math.min(lighthouseScore, 100), hasHttps, hasMetaTags }
  } finally {
    await browser.close()
  }
}

async function checkIndexedPages(domain: string): Promise<number> {
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: `site:${domain}`, gl: 'fr' }),
    })

    if (!response.ok) return 0
    const data = await response.json()
    return data.organic?.length ?? 0
  } catch {
    return 0
  }
}
