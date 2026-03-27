import { GoogleGenerativeAI } from '@google/generative-ai'

export interface PitchContext {
  ownerName: string | null
  companyName: string
  sector: string | null
  city: string | null
  googleRating: number | null
  reviewsCount: number
  websiteUrl: string | null
  // Issues detected from audit
  issues: string[] // e.g. ['pas mobile', 'lent', 'pas HTTPS', 'peu indexé']
}

function getFirstName(ownerName: string | null): string | null {
  if (!ownerName) return null
  const first = ownerName.trim().split(/\s+/)[0]
  return first || null
}

function buildPrompt(ctx: PitchContext): string {
  const firstName = getFirstName(ctx.ownerName)
  const greeting = firstName ? `Tu t'adresses à ${firstName}, ` : "Tu t'adresses au propriétaire (prénom inconnu), "

  const ratingLine =
    ctx.googleRating !== null && ctx.reviewsCount > 0
      ? `L'entreprise a ${ctx.googleRating} étoiles sur Google avec ${ctx.reviewsCount} avis.`
      : ctx.reviewsCount > 0
        ? `L'entreprise a ${ctx.reviewsCount} avis Google.`
        : "Pas d'avis Google trouvés."

  const websiteLine = ctx.websiteUrl
    ? `L'entreprise a un site web : ${ctx.websiteUrl}.`
    : "L'entreprise n'a pas de site web."

  const issuesLine =
    ctx.issues.length > 0
      ? `Problèmes détectés sur le site : ${ctx.issues.join(', ')}.`
      : ctx.websiteUrl
        ? "Aucun problème majeur détecté sur le site."
        : ''

  const opportunityLine = !ctx.websiteUrl
    ? "C'est une vraie opportunité : sans site web, ils perdent de la visibilité en ligne et des clients potentiels."
    : ''

  return `Tu es un commercial expert en création de sites web pour les PME françaises.
${greeting}gérant de "${ctx.companyName}"${ctx.sector ? `, dans le secteur "${ctx.sector}"` : ''}${ctx.city ? `, à ${ctx.city}` : ''}.

DONNÉES :
- ${ratingLine}
- ${websiteLine}
${issuesLine ? `- ${issuesLine}` : ''}
${opportunityLine ? `- ${opportunityLine}` : ''}

CONSIGNES :
- Écris UNE phrase d'accroche unique pour un appel à froid (cold call), en français.
- ${firstName ? `Commence par "Bonjour ${firstName}," puis` : 'Commence par une accroche directe puis'}
  mentionne 1 ou 2 faiblesses spécifiques détectées${!ctx.websiteUrl ? " (absence de site web)" : ""}.
- Mentionne la réputation de l'entreprise (notes / avis) pour montrer que tu as fait tes devoirs.
- Ton : direct, confiant, pas commercial ni vendeur. Maximum 3 phrases. Zéro emoji.
- Termine par une question ou un crochet implicite qui donne envie de répondre.
- Exemple de style : "Bonjour Thomas, j'ai vu que La Boulangerie du Midi affiche 4,8 étoiles avec 120 avis Google — une vraie réputation en ligne. Dommage que votre site ne s'affiche pas sur mobile, vous perdez probablement 60% de vos visiteurs. J'ai quelque chose à vous montrer."

Réponds UNIQUEMENT avec la phrase d'accroche. Pas de guillemets autour. Pas d'explications.`
}

function buildFallbackPitch(ctx: PitchContext): string {
  const firstName = getFirstName(ctx.ownerName)
  const salutation = firstName ? `Bonjour ${firstName},` : 'Bonjour,'

  const ratingPart =
    ctx.googleRating !== null && ctx.reviewsCount > 0
      ? ` j'ai vu que ${ctx.companyName} affiche ${ctx.googleRating} étoiles avec ${ctx.reviewsCount} avis Google — une vraie réputation en ligne.`
      : ctx.reviewsCount > 0
        ? ` j'ai vu que ${ctx.companyName} a ${ctx.reviewsCount} avis Google.`
        : ` j'ai regardé la présence en ligne de ${ctx.companyName}.`

  if (!ctx.websiteUrl) {
    return `${salutation}${ratingPart} Vous n'avez pas encore de site web, ce qui représente une vraie opportunité de capter des clients en ligne. J'ai quelque chose à vous proposer qui pourrait changer ça rapidement.`
  }

  const issuePart =
    ctx.issues.length > 0
      ? ` Dommage que votre site présente quelques problèmes — ${ctx.issues.slice(0, 2).join(' et ')} — vous perdez probablement des clients.`
      : ` Votre site web a du potentiel mais quelques optimisations pourraient faire une vraie différence.`

  return `${salutation}${ratingPart}${issuePart} J'ai quelque chose à vous montrer.`
}

export async function generateColdPitch(ctx: PitchContext): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return buildFallbackPitch(ctx)
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        maxOutputTokens: 256,
        temperature: 0.7,
      },
    })

    const prompt = buildPrompt(ctx)
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()

    if (!text || text.length < 20) {
      return buildFallbackPitch(ctx)
    }

    return text
  } catch {
    return buildFallbackPitch(ctx)
  }
}
