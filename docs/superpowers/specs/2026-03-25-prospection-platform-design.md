# Plateforme de Prospection & Génération de Sites Web — Spec

## Résumé

Plateforme interne Next.js 14 pour 2 utilisateurs (Jules, Ewan). Trois modules : scraping de prospects, CRM léger, génération automatique de sites démo déployés sur Vercel. Usage : prospection commerciale de sites web pour entreprises locales (Pays Basque, France).

## Stack

- Next.js 14 (App Router)
- Supabase (BDD PostgreSQL + Auth + Realtime)
- Tailwind CSS
- Claude API (Anthropic) — modèle sonnet pour la génération de sites
- Vercel REST API pour le déploiement automatique
- Google Places API pour la découverte de leads
- Playwright pour l'audit de sites et le scraping de marque
- Serper API pour les recherches Google programmatiques

## Architecture

```
/app
├── /login                        → Auth Supabase (email/password)
├── /(dashboard)                  → Layout avec sidebar
│   ├── /page.tsx                 → Dashboard stats globales
│   ├── /leads                    → CRM : vue Kanban + vue Table
│   ├── /leads/[id]               → Fiche lead détaillée
│   ├── /scan                     → Module de scraping
│   └── /stats                    → Statistiques Jules vs Ewan
└── /api
    ├── /scan/launch              → POST: lance scraping Places API
    ├── /scan/analyze             → POST: audit Playwright d'un site
    ├── /leads/[id]/generate      → POST: pipeline génération site démo
    └── /leads/[id]/deploy        → POST: déploiement Vercel

/lib
├── supabase.ts                   → Client Supabase (server + client)
├── scoring.ts                    → Calcul du score /100
├── scraper/
│   ├── google-places.ts          → Recherche Google Places API
│   ├── site-analyzer.ts          → Audit Playwright (Lighthouse, responsive, meta, HTTPS)
│   └── brand-scraper.ts          → Scraping marque (couleurs, logo, textes, réseaux sociaux)
└── generator/
    ├── claude-generate.ts        → Appel Claude API pour générer le code du site
    └── vercel-deploy.ts          → Déploiement via Vercel REST API

/components
├── /dashboard                    → StatCard, WeeklyChart, RevenueCard
├── /leads                        → KanbanBoard, LeadsTable, LeadCard, LeadDetail, GenerateButton
├── /scan                         → SearchForm, ProgressBar, ResultsList
└── /ui                           → Button, Badge, Input, Select, Dialog, Sidebar
```

## Module 1 — Scraper & Scoring

### Stratégie hybride

1. **Google Places API** : découverte des leads. Requête par ville + catégorie. Retourne nom, téléphone, adresse, site web, note, nombre d'avis, photos, horaires.
2. **Playwright** (async, en background) : audit du site existant du prospect. Mesure Lighthouse performance, responsive, HTTPS, meta tags.
3. **Serper API** : nombre de pages indexées sur Google pour le domaine du prospect.

### Scoring /100 (deux phases)

**Phase 1 — Instantanée** (dès retour Places API) :

| Critère | Points |
|---|---|
| Aucun site web détecté | +40 |
| +50 avis Google (business actif) | +10 |
| Note Google > 4.0 | +5 |
| Secteur prioritaire (resto, hôtel, artisan, commerce) | +5 |

**Phase 2 — Asynchrone** (après audit Playwright) :

| Critère | Points |
|---|---|
| Site non responsive / non mobile | +25 |
| Score Lighthouse Performance < 50 | +20 |
| Site sans HTTPS | +15 |
| Pas de meta title/description | +10 |
| Moins de 5 pages indexées | +10 |
| Fiche Google incomplète | +10 |

Le score passe de `scoring_status: 'partial'` à `'complete'` une fois l'audit terminé.

### Interface

- Champ ville + champ catégorie
- Bouton "Lancer le scan"
- Barre de progression temps réel (via polling ou Supabase Realtime sur `scraping_jobs.progress`)
- Résultats affichés au fur et à mesure, avec score partiel puis complet
- Les leads sont insérés automatiquement dans Supabase

### Données extraites par prospect

```typescript
interface Lead {
  id: string
  created_at: string
  company_name: string
  sector: string
  city: string
  address: string
  phone: string
  website_url: string | null
  google_maps_url: string
  google_rating: number
  google_reviews_count: number
  score: number
  scoring_status: 'partial' | 'complete'
  status: 'to_call' | 'contacted' | 'demo_sent' | 'sold' | 'refused'
  assigned_to: string | null  // 'jules' | 'ewan'
  sale_price: number | null
  notes: string | null
  demo_url: string | null
  demo_status: 'idle' | 'scraping' | 'generating' | 'deploying' | 'deployed' | 'error'
  demo_generated_at: string | null
  last_contact_at: string | null
  brand_data: BrandData | null
}
```

## Module 2 — Dashboard CRM

### Vues

**Vue Kanban** : 5 colonnes drag & drop via `@dnd-kit/core`
- À appeler → Contacté → Démo envoyée → Vendu → Refus
- Chaque carte : nom, secteur, ville, score (anneau coloré), téléphone cliquable
- Compteur de leads par colonne

**Vue Table** : tableau trié et filtrable
- Colonnes : nom, secteur, ville, score, statut, assigné, téléphone, dernier contact, démo
- Tri par score (défaut : décroissant)
- Filtres : statut, assigné (Jules/Ewan), ville, score min
- Recherche textuelle instantanée

### Fiche lead détaillée (`/leads/[id]`)

- Toutes les infos du lead
- Téléphone cliquable (`tel:`)
- Menu déroulant statut
- Menu déroulant assignation (Jules / Ewan)
- Champ prix de vente (si statut = Vendu)
- Champ notes libres (textarea)
- Champ date dernier contact
- Bouton "Générer le site démo" avec indicateur de statut
- Lien vers la démo déployée + bouton "Copier le lien"
- Section brand_data affichée si disponible (couleurs, logo, services)

### Stats (en haut du dashboard)

- Total leads scrapés
- Leads contactés cette semaine
- Sites vendus ce mois + CA total
- Répartition Jules / Ewan (ventes + CA)

### Temps réel

Supabase Realtime pour synchroniser les changements entre Jules et Ewan sans refresh. Quand l'un change un statut ou s'assigne un lead, l'autre voit la mise à jour instantanément.

## Module 3 — Générateur de site démo

### Pipeline

```
1. Clic "Générer" → demo_status = 'scraping'
2. brand-scraper (Playwright) scrape le site existant, Google Maps, réseaux sociaux
3. Données structurées en JSON (BrandData) → stockées dans brand_data
4. demo_status = 'generating'
5. Appel Claude API (sonnet) avec le JSON + prompt système
6. Claude retourne le code d'un site Next.js complet
7. demo_status = 'deploying'
8. Création fichiers en mémoire, upload via Vercel REST API (POST /v13/deployments)
9. Récupération de l'URL de déploiement
10. demo_status = 'deployed', demo_url = URL, demo_generated_at = now()
11. En cas d'erreur à n'importe quelle étape : demo_status = 'error'
```

### Scraping marque (BrandData)

Sources scrapées via Playwright :
- Site web existant : textes, couleurs dominantes (extraction CSS), logo (favicon/header img), images
- Google Maps : description, services listés, photos, horaires, top 5 avis
- Réseaux sociaux publics (Facebook/Instagram si trouvés via recherche Google) : bio, ton
- Google Images : recherche "[nom] logo" pour fallback logo

```typescript
interface BrandData {
  name: string
  tagline: string | null
  description: string
  services: string[]
  values: string[]
  tone: 'professionnel' | 'chaleureux' | 'premium' | 'artisanal'
  colors: {
    primary: string
    secondary: string
    accent: string
  }
  logo_url: string | null
  images: string[]
  contact: {
    phone: string
    email: string | null
    address: string
    hours: string | null
  }
  social: {
    instagram: string | null
    facebook: string | null
  }
  reviews: Array<{
    text: string
    rating: number
    author: string
  }>
}
```

### Génération via Claude API

Modèle : `claude-sonnet-4-20250514`

Le prompt système demande un site one-page avec : Hero, Services, À propos, Avis clients, Contact + Map. Personnalisé aux couleurs, ton et vocabulaire de la marque. Mobile-first, SEO optimisé.

Le code généré est un projet Next.js minimal (page.tsx + layout.tsx + globals.css + package.json + next.config.js) déployable tel quel.

### Déploiement Vercel

Via l'API REST Vercel (`POST https://api.vercel.com/v13/deployments`) :
- Upload des fichiers en base64
- Nom du projet : `demo-[slug-entreprise]`
- Token Vercel via variable d'environnement
- Pas besoin du CLI Vercel côté serveur

## Schéma Supabase

```sql
-- Types ENUM
CREATE TYPE lead_status AS ENUM ('to_call', 'contacted', 'demo_sent', 'sold', 'refused');
CREATE TYPE demo_status AS ENUM ('idle', 'scraping', 'generating', 'deploying', 'deployed', 'error');
CREATE TYPE scoring_status AS ENUM ('partial', 'complete');

-- Table leads
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  company_name TEXT NOT NULL,
  sector TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  website_url TEXT,
  google_maps_url TEXT,
  google_rating NUMERIC(2,1),
  google_reviews_count INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  scoring_status scoring_status DEFAULT 'partial',
  status lead_status DEFAULT 'to_call',
  assigned_to TEXT,  -- 'jules' | 'ewan'
  sale_price NUMERIC(10,2),
  notes TEXT,
  demo_url TEXT,
  demo_status demo_status DEFAULT 'idle',
  demo_generated_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  brand_data JSONB
);

-- Table scraping_jobs
CREATE TABLE scraping_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  query_city TEXT NOT NULL,
  query_sector TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'running' | 'completed' | 'error'
  progress INTEGER DEFAULT 0,
  leads_found INTEGER DEFAULT 0,
  leads_added INTEGER DEFAULT 0,
  error_message TEXT
);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read leads"
  ON leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert leads"
  ON leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update leads"
  ON leads FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read jobs"
  ON scraping_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert jobs"
  ON scraping_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update jobs"
  ON scraping_jobs FOR UPDATE TO authenticated USING (true);
```

## Design UI

### Thème

- **Fond** : `#0a0a0f` (page), `#12121a` (surfaces/cards), `#1a1a2e` (hover)
- **Bordures** : `#1e1e2e`
- **Texte** : `#f0f0f0` (primaire), `#8888aa` (secondaire)
- **Accent primaire** : `#3b82f6` (bleu électrique) — navigation, actions principales
- **Accent succès/vente** : `#84cc16` (vert lime) — CTAs vente, statut vendu
- **Danger** : `#ef4444` — erreurs, refus
- **Warning** : `#f59e0b` — scores moyens

### Typographie

- Headings : `Space Grotesk` (Google Fonts)
- Body : `Space Grotesk`
- Données/Scores/Monospace : `JetBrains Mono` (Google Fonts)

### Composants clés

- **Sidebar** : fixe à gauche, 240px, collapsible en icônes (60px). Logo en haut, navigation avec icônes Lucide, indicateur actif = barre latérale bleue.
- **Score badge** : anneau circulaire SVG coloré (vert > 70, orange 40-70, rouge < 40) avec le chiffre au centre.
- **Kanban** : colonnes scrollables, cards draggables via `@dnd-kit/core`, compteur par colonne.
- **Table** : header sticky, lignes alternées subtiles, hover state.
- **Bouton générer** : état idle → loading spinner avec texte de progression → lien cliquable.

### Responsive

- Desktop : sidebar + contenu principal
- Tablet : sidebar collapsée par défaut
- Mobile : sidebar → bottom navigation bar, table → stack de cards

### Animations

- Framer Motion pour les transitions de page et les changements de statut
- Transitions CSS pour les hovers et les interactions courantes

## Variables d'environnement

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
VERCEL_TOKEN=
GOOGLE_PLACES_API_KEY=
SERPER_API_KEY=
```

## Dépendances principales

```json
{
  "next": "^14",
  "react": "^18",
  "@supabase/supabase-js": "^2",
  "@supabase/ssr": "^0",
  "@anthropic-ai/sdk": "^0",
  "@dnd-kit/core": "^6",
  "@dnd-kit/sortable": "^8",
  "framer-motion": "^11",
  "lucide-react": "^0",
  "playwright": "^1",
  "tailwindcss": "^3",
  "slugify": "^1"
}
```

## Hors scope (v1)

- Envoi d'emails/SMS automatiques aux prospects
- Intégration calendrier (prise de RDV)
- Multi-tenant / plus de 2 utilisateurs
- Facturation / devis automatique
- App mobile native
