// Gemini Vision scoring of website screenshots

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { VisionResult } from '../types/pipeline'

const FALLBACK_RESULT: VisionResult = {
  score: 50,
  notes: 'Analyse impossible',
  design_age: 'outdated',
  mobile_friendly: false,
  issues: [],
}

function buildPrompt(companyName: string): string {
  return `Analyze this website screenshot for the company "${companyName}".

Score the website from 0 to 100 where:
- 0  = very modern, well-designed site that does NOT need a redesign
- 100 = very outdated / poorly designed site that URGENTLY needs a redesign

Return ONLY valid JSON with this exact structure (no markdown, no code block):
{
  "score": <number 0-100>,
  "notes": "<brief explanation in 1-2 sentences>",
  "design_age": "<one of: modern | outdated | very_outdated | none>",
  "mobile_friendly": <true | false>,
  "issues": ["<issue 1>", "<issue 2>"]
}`
}

export async function scoreWithVision(
  screenshotUrl: string,
  companyName: string
): Promise<VisionResult> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return FALLBACK_RESULT
    }

    // Fetch the screenshot image as bytes
    const imageResponse = await fetch(screenshotUrl)
    if (!imageResponse.ok) {
      return FALLBACK_RESULT
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const imageBytes = Buffer.from(imageBuffer)
    const base64Image = imageBytes.toString('base64')

    const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg'
    const mimeType = contentType.split(';')[0].trim() as
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp'
      | 'image/gif'

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
      buildPrompt(companyName),
    ])

    const text = result.response.text().trim()

    // Strip potential markdown code fences
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    const parsed = JSON.parse(cleaned) as {
      score: number
      notes: string
      design_age: string
      mobile_friendly: boolean
      issues: string[]
    }

    const validDesignAges = ['modern', 'outdated', 'very_outdated', 'none'] as const
    type DesignAge = (typeof validDesignAges)[number]

    const design_age: DesignAge = validDesignAges.includes(
      parsed.design_age as DesignAge
    )
      ? (parsed.design_age as DesignAge)
      : 'outdated'

    return {
      score: Math.min(100, Math.max(0, Math.round(Number(parsed.score)))),
      notes: String(parsed.notes ?? ''),
      design_age,
      mobile_friendly: Boolean(parsed.mobile_friendly),
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map(String)
        : [],
    }
  } catch {
    return FALLBACK_RESULT
  }
}
