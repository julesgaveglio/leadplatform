// CMS detection via HTML pattern matching (no external API needed)

export interface CmsDetectionResult {
  cms: string | null
  technologies: string[]
}

interface CmsPattern {
  name: string
  pattern: RegExp
}

const CMS_PATTERNS: CmsPattern[] = [
  { name: 'WordPress', pattern: /wp-content|wp-includes/i },
  { name: 'Wix', pattern: /wixsite\.com|_wix_browser_sess/i },
  { name: 'Squarespace', pattern: /squarespace\.com|static\.squarespace/i },
  { name: 'Shopify', pattern: /cdn\.shopify\.com/i },
  { name: 'Webflow', pattern: /webflow\.com/i },
  { name: 'Joomla', pattern: /\/administrator\/index\.php|joomla/i },
  { name: 'Drupal', pattern: /drupal/i },
  { name: 'PrestaShop', pattern: /prestashop/i },
]

interface TechPattern {
  name: string
  pattern: RegExp
}

const TECH_PATTERNS: TechPattern[] = [
  { name: 'Bootstrap', pattern: /bootstrap\.min\.css/i },
  { name: 'jQuery', pattern: /jquery\.min\.js/i },
]

const REACT_NEXT_PATTERN = /__NEXT_DATA__|react\.production/i

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export async function detectCms(url: string): Promise<CmsDetectionResult> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    let response: Response
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'follow',
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const html = await response.text()
    const technologies: string[] = []

    // Check x-powered-by header for WordPress
    const poweredBy = response.headers.get('x-powered-by') ?? ''
    const xGenerator = response.headers.get('x-generator') ?? ''

    let cms: string | null = null

    // Check WordPress header first
    if (/wordpress/i.test(poweredBy) || /wordpress/i.test(xGenerator)) {
      cms = 'WordPress'
    }

    // HTML + header pattern matching for CMS
    if (!cms) {
      for (const { name, pattern } of CMS_PATTERNS) {
        if (pattern.test(html)) {
          cms = name
          break
        }
      }
    }

    // Technology detection
    for (const { name, pattern } of TECH_PATTERNS) {
      if (pattern.test(html)) {
        technologies.push(name)
      }
    }

    // React / Next.js detection
    if (REACT_NEXT_PATTERN.test(html)) {
      if (/__NEXT_DATA__/i.test(html)) {
        technologies.push('Next.js')
      } else {
        technologies.push('React')
      }
    }

    return { cms, technologies }
  } catch {
    return { cms: null, technologies: [] }
  }
}
