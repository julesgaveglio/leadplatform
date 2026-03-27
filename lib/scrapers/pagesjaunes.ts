import { chromium } from 'playwright'

export interface PJResult {
  name: string
  phone: string | null
  address: string | null
  city: string | null
  website: string | null
  category: string | null
}

export async function scrapePagesJaunes(
  sector: string,
  city: string,
  maxResults = 20,
): Promise<PJResult[]> {
  const browser = await chromium.launch({ headless: true })

  try {
    const context = await browser.newContext({
      locale: 'fr-FR',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    const url =
      `https://www.pagesjaunes.fr/annuaire/chercherlespros` +
      `?quoiqui=${encodeURIComponent(sector)}&ou=${encodeURIComponent(city)}`

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Accept cookies banner if present
    try {
      await page.click('#didomi-notice-agree-button', { timeout: 3_000 })
    } catch {
      // no cookie banner, continue
    }

    // Wait for at least one listing card
    try {
      await page.waitForSelector('.bi-generic, .result-list .bi', { timeout: 10_000 })
    } catch {
      return []
    }

    const results: PJResult[] = await page.evaluate((max: number) => {
      const cards = Array.from(
        document.querySelectorAll('.bi-generic, .result-list .bi'),
      ).slice(0, max)

      return cards.map((card) => {
        const nameEl =
          card.querySelector('.denomination-links a') ??
          card.querySelector('.denomination-links') ??
          card.querySelector('.bi-denomination a') ??
          card.querySelector('.bi-denomination')

        const phoneEl =
          card.querySelector('.phones .coord-numero') ??
          card.querySelector('.phones') ??
          card.querySelector('[class*="phone"]')

        const streetEl =
          card.querySelector('.street-address') ??
          card.querySelector('[itemprop="streetAddress"]')

        const localityEl =
          card.querySelector('.locality') ??
          card.querySelector('[itemprop="addressLocality"]')

        const websiteEl =
          card.querySelector('.bi-url a') ??
          card.querySelector('a[class*="site"]') ??
          card.querySelector('a[href*="http"][class*="url"]')

        const categoryEl =
          card.querySelector('.categorie') ??
          card.querySelector('.activite')

        return {
          name: nameEl?.textContent?.trim() ?? '',
          phone: phoneEl?.textContent?.trim().replace(/\s+/g, ' ') ?? null,
          address: streetEl?.textContent?.trim() ?? null,
          city: localityEl?.textContent?.trim() ?? null,
          website: websiteEl?.getAttribute('href') ?? null,
          category: categoryEl?.textContent?.trim() ?? null,
        }
      })
    }, maxResults)

    return results.filter((r) => r.name.length > 0)
  } catch {
    return []
  } finally {
    await browser.close()
  }
}
