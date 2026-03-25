import Anthropic from '@anthropic-ai/sdk'
import type { BrandData } from '@/lib/types/database'

const SYSTEM_PROMPT = `Tu es un expert développeur Next.js et designer UI/UX.
À partir des données de marque fournies, génère un site web complet en une seule page.
Le site doit être composé de ces fichiers exacts (et UNIQUEMENT ces fichiers) :

1. package.json — avec next, react, react-dom comme dépendances
2. next.config.js — config minimale
3. app/layout.tsx — layout avec metadata SEO
4. app/page.tsx — page principale avec toutes les sections
5. app/globals.css — styles Tailwind + custom

Le site doit être :
1. ULTRA-PERSONNALISÉ à la marque (couleurs exactes, ton, vocabulaire du secteur)
2. Moderne, mobile-first, rapide à charger
3. Optimisé SEO (balises meta, schema.org en JSON-LD, Open Graph)
4. Avec les sections : Hero, Services, À propos, Avis clients, Contact + Map embed
5. Design professionnel et mémorable — PAS un template générique

IMPORTANT :
- Utilise Tailwind CSS via CDN dans le layout (pas besoin de config Tailwind)
- Le code doit compiler et fonctionner tel quel avec "next build"
- N'utilise PAS de dépendances externes en dehors de next/react
- Réponds UNIQUEMENT avec un JSON valide contenant les fichiers, format :
{"files": [{"path": "package.json", "content": "..."}, {"path": "next.config.js", "content": "..."}, ...]}
- Pas de markdown, pas d'explications, JUSTE le JSON.`

interface GeneratedFile {
  path: string
  content: string
}

interface GenerationResult {
  files: GeneratedFile[]
}

const REQUIRED_FILES = ['package.json', 'app/page.tsx', 'app/layout.tsx']

export async function generateSite(brandData: BrandData): Promise<GenerationResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Voici les données de la marque :\n\n${JSON.stringify(brandData, null, 2)}\n\nGénère le site.`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  let result: GenerationResult

  try {
    result = JSON.parse(text)
  } catch {
    // Try extracting JSON from potential markdown wrapper
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude n\'a pas retourné un JSON valide')
    result = JSON.parse(jsonMatch[0])
  }

  // Validate required files
  const filePaths = result.files.map(f => f.path)
  const missing = REQUIRED_FILES.filter(f => !filePaths.includes(f))

  if (missing.length > 0) {
    // Retry once
    const retryMessage = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Voici les données de la marque :\n\n${JSON.stringify(brandData, null, 2)}\n\nGénère le site.`,
        },
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: `Il manque les fichiers suivants : ${missing.join(', ')}. Régénère le JSON complet avec TOUS les fichiers.`,
        },
      ],
    })

    const retryText = retryMessage.content[0].type === 'text' ? retryMessage.content[0].text : ''
    try {
      result = JSON.parse(retryText)
    } catch {
      const match = retryText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Retry échoué : JSON invalide')
      result = JSON.parse(match[0])
    }

    const retryPaths = result.files.map(f => f.path)
    const stillMissing = REQUIRED_FILES.filter(f => !retryPaths.includes(f))
    if (stillMissing.length > 0) {
      throw new Error(`Fichiers manquants après retry : ${stillMissing.join(', ')}`)
    }
  }

  return result
}
