// ScreenshotOne API integration

export async function takeScreenshot(url: string): Promise<string | null> {
  const apiKey = process.env.SCREENSHOTONE_API_KEY
  if (!apiKey) {
    return null
  }

  const params = new URLSearchParams({
    access_key: apiKey,
    url,
    viewport_width: '1280',
    viewport_height: '800',
    format: 'jpg',
    image_quality: '80',
    full_page: 'false',
    delay: '2',
    timeout: '30',
  })

  return `https://api.screenshotone.com/take?${params.toString()}`
}
