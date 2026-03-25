# Plateforme Prospection — Plan d'implémentation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire une plateforme interne de prospection avec scraping de leads, CRM léger et génération automatique de sites démo déployés sur Vercel.

**Architecture:** Next.js 14 App Router avec Supabase (auth + BDD + realtime). Trois modules : scraping Google Places + audit Playwright, dashboard CRM Kanban/Table, pipeline de génération de site via Claude API + déploiement Vercel REST API.

**Tech Stack:** Next.js 14, Supabase, Tailwind CSS, Claude API (Anthropic), Vercel REST API, Google Places API, Playwright, Serper API, @dnd-kit, Framer Motion, Lucide React

**Spec:** `docs/superpowers/specs/2026-03-25-prospection-platform-design.md`

---

## Chunk 1: Fondations (Project Setup + Supabase + Auth + Layout)

### Task 1: Scaffolding du projet Next.js

**Files:**
- Create: `package.json`
- Create: `next.config.js`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `tsconfig.json`
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `.env.local.example`
- Create: `.gitignore`

- [ ] **Step 1: Initialiser le projet Next.js**

```bash
cd "/Users/julesgaveglio/Ew X Jul"
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```

- [ ] **Step 2: Installer toutes les dépendances**

```bash
npm install @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities framer-motion lucide-react slugify
npm install -D playwright @types/node
```

- [ ] **Step 3: Configurer les fonts (Space Grotesk + JetBrains Mono)**

Modifier `app/layout.tsx` :

```tsx
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
})

export const metadata = {
  title: 'Ew X Jul — Prospection',
  description: 'Plateforme de prospection interne',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#0a0a0f] text-[#f0f0f0] font-[family-name:var(--font-space-grotesk)]">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Configurer le thème Tailwind**

Modifier `tailwind.config.ts` — ajouter les couleurs et fonts custom :

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0f',
          surface: '#12121a',
          hover: '#1a1a2e',
        },
        border: {
          DEFAULT: '#1e1e2e',
        },
        text: {
          primary: '#f0f0f0',
          secondary: '#8888aa',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
        success: '#84cc16',
        danger: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 5: Configurer globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-bg text-text-primary antialiased;
  }
}

@layer components {
  .card {
    @apply bg-bg-surface border border-border rounded-lg;
  }
}
```

- [ ] **Step 6: Créer .env.local.example**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
VERCEL_TOKEN=
GOOGLE_PLACES_API_KEY=
SERPER_API_KEY=
```

- [ ] **Step 7: Vérifier que le projet compile**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 14 project with theme config"
```

---

### Task 2: Client Supabase + Migration SQL

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `lib/types/database.ts`

- [ ] **Step 1: Créer les types TypeScript de la base**

```ts
// lib/types/database.ts
export type LeadStatus = 'to_call' | 'contacted' | 'demo_sent' | 'sold' | 'refused'
export type DemoStatus = 'idle' | 'scraping' | 'generating' | 'deploying' | 'deployed' | 'error'
export type ScoringStatus = 'partial' | 'complete'
export type JobStatus = 'pending' | 'running' | 'completed' | 'error'
export type AssignedTo = 'jules' | 'ewan'

export interface Lead {
  id: string
  created_at: string
  company_name: string
  sector: string | null
  city: string | null
  address: string | null
  phone: string | null
  website_url: string | null
  google_maps_url: string | null
  google_rating: number | null
  google_reviews_count: number
  score: number
  scoring_status: ScoringStatus
  status: LeadStatus
  assigned_to: AssignedTo | null
  sale_price: number | null
  notes: string | null
  demo_url: string | null
  demo_status: DemoStatus
  demo_error_message: string | null
  demo_generated_at: string | null
  last_contact_at: string | null
  brand_data: BrandData | null
}

export interface BrandData {
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

export interface ScrapingJob {
  id: string
  created_at: string
  query_city: string
  query_sector: string
  status: JobStatus
  progress: number
  leads_found: number
  leads_added: number
  error_message: string | null
}
```

- [ ] **Step 2: Créer le client Supabase (browser)**

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Créer le client Supabase (server)**

```ts
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — ignore
          }
        },
      },
    }
  )
}

export function createServiceClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 4: Créer le middleware Supabase**

```ts
// lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **Step 5: Créer le middleware Next.js**

```ts
// middleware.ts (root)
import { updateSession } from '@/lib/supabase/middleware'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 6: Écrire la migration SQL**

```sql
-- supabase/migrations/001_initial_schema.sql

CREATE TYPE lead_status AS ENUM ('to_call', 'contacted', 'demo_sent', 'sold', 'refused');
CREATE TYPE demo_status_enum AS ENUM ('idle', 'scraping', 'generating', 'deploying', 'deployed', 'error');
CREATE TYPE scoring_status AS ENUM ('partial', 'complete');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'error');

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
  assigned_to TEXT,
  sale_price NUMERIC(10,2),
  notes TEXT,
  demo_url TEXT,
  demo_status demo_status_enum DEFAULT 'idle',
  demo_error_message TEXT,
  demo_generated_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  brand_data JSONB,
  CONSTRAINT assigned_to_check CHECK (assigned_to IS NULL OR assigned_to IN ('jules', 'ewan'))
);

CREATE UNIQUE INDEX leads_google_maps_url_unique
  ON leads (google_maps_url) WHERE google_maps_url IS NOT NULL;

CREATE TABLE scraping_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  query_city TEXT NOT NULL,
  query_sector TEXT NOT NULL,
  status job_status DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  leads_found INTEGER DEFAULT 0,
  leads_added INTEGER DEFAULT 0,
  error_message TEXT
);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_leads" ON leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_leads" ON leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_leads" ON leads FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_select_jobs" ON scraping_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_jobs" ON scraping_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_jobs" ON scraping_jobs FOR UPDATE TO authenticated USING (true);
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client, types, migration, and auth middleware"
```

---

### Task 3: Page de login

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`

- [ ] **Step 1: Créer la server action de login**

```ts
// app/login/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
```

- [ ] **Step 2: Créer la page de login**

```tsx
// app/login/page.tsx
'use client'

import { useState } from 'react'
import { login } from './actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await login(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="card p-8 w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Ew X Jul</h1>
          <p className="text-text-secondary text-sm mt-1">Plateforme de prospection</p>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-text-secondary mb-1">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full px-3 py-2 bg-bg border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-text-secondary mb-1">Mot de passe</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full px-3 py-2 bg-bg border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {error && (
            <p className="text-danger text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-accent hover:bg-accent-hover text-white rounded-md font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add login page with Supabase auth"
```

---

### Task 4: Layout Dashboard avec Sidebar

**Files:**
- Create: `components/ui/sidebar.tsx`
- Create: `app/(dashboard)/layout.tsx`
- Create: `app/(dashboard)/page.tsx`

- [ ] **Step 1: Créer le composant Sidebar**

```tsx
// components/ui/sidebar.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Search, Users, BarChart3, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { logout } from '@/app/login/actions'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scan', label: 'Scanner', icon: Search },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/stats', label: 'Statistiques', icon: BarChart3 },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col fixed left-0 top-0 h-screen bg-bg-surface border-r border-border transition-all duration-200 z-40 ${
          collapsed ? 'w-[60px]' : 'w-[240px]'
        }`}
      >
        <div className={`flex items-center h-16 border-b border-border ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          {!collapsed && <span className="text-lg font-bold">Ew X Jul</span>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-md transition-colors relative ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r" />
                )}
                <item.icon size={20} />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-border p-2">
          <button
            onClick={() => logout()}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-text-secondary hover:bg-bg-hover hover:text-danger transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut size={20} />
            {!collapsed && <span className="text-sm">Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-surface border-t border-border z-40 flex justify-around py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1 ${
                isActive ? 'text-accent' : 'text-text-secondary'
              }`}
            >
              <item.icon size={20} />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
```

- [ ] **Step 2: Créer le layout dashboard**

```tsx
// app/(dashboard)/layout.tsx
import { Sidebar } from '@/components/ui/sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="md:ml-[240px] p-6 pb-20 md:pb-6">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Créer la page dashboard placeholder**

```tsx
// app/(dashboard)/page.tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <p className="text-text-secondary">Statistiques à venir.</p>
    </div>
  )
}
```

- [ ] **Step 4: Vérifier que le build passe**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add dashboard layout with sidebar and mobile nav"
```

---

## Chunk 2: Scoring + Composants UI partagés

### Task 5: Logique de scoring (TDD)

**Files:**
- Create: `lib/scoring.ts`
- Create: `lib/__tests__/scoring.test.ts`

- [ ] **Step 1: Installer vitest**

```bash
npm install -D vitest @vitejs/plugin-react
```

Créer `vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

Ajouter dans `package.json` scripts : `"test": "vitest run", "test:watch": "vitest"`

- [ ] **Step 2: Écrire les tests de scoring**

```ts
// lib/__tests__/scoring.test.ts
import { describe, it, expect } from 'vitest'
import { calculateScore } from '../scoring'

describe('calculateScore', () => {
  describe('Branche A — pas de site web', () => {
    it('donne +40 pour pas de site', () => {
      const result = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      expect(result.score).toBeGreaterThanOrEqual(40)
    })

    it('donne +10 pour +50 avis', () => {
      const base = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      const withReviews = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 55, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      expect(withReviews.score - base.score).toBe(10)
    })

    it('donne +5 pour note > 4.0', () => {
      const base = calculateScore({ website_url: null, google_rating: 3.5, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      const highRating = calculateScore({ website_url: null, google_rating: 4.5, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      expect(highRating.score - base.score).toBe(5)
    })

    it('donne +5 pour secteur prioritaire', () => {
      const base = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      const priority = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 10, sector: 'restaurant', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      expect(priority.score - base.score).toBe(5)
    })

    it('donne +10 pour fiche Google incomplète', () => {
      const complete = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      const incomplete = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: false, indexedPages: 10 })
      expect(incomplete.score - complete.score).toBe(10)
    })

    it('donne +10 pour moins de 5 pages indexées', () => {
      const many = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      const few = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 2 })
      expect(few.score - many.score).toBe(10)
    })

    it('scoring_status est complete sans site web', () => {
      const result = calculateScore({ website_url: null, google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      expect(result.scoring_status).toBe('complete')
    })

    it('score max branche A = 80', () => {
      const result = calculateScore({ website_url: null, google_rating: 4.5, google_reviews_count: 100, sector: 'restaurant', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: false, indexedPages: 2 })
      expect(result.score).toBe(80)
    })

    it('score cappé à 100', () => {
      const result = calculateScore({ website_url: null, google_rating: 4.5, google_reviews_count: 100, sector: 'restaurant', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: false, indexedPages: 2 })
      expect(result.score).toBeLessThanOrEqual(100)
    })
  })

  describe('Branche B — site web existant (phase 1)', () => {
    it('ne donne PAS +40 pour pas de site', () => {
      const result = calculateScore({ website_url: 'https://example.com', google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      expect(result.score).toBeLessThan(40)
    })

    it('scoring_status est partial avec site web', () => {
      const result = calculateScore({ website_url: 'https://example.com', google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      expect(result.scoring_status).toBe('partial')
    })
  })

  describe('Branche B — phase 2 (audit)', () => {
    it('ajoute les points d audit au score existant', () => {
      const phase1 = calculateScore({ website_url: 'https://example.com', google_rating: 4.5, google_reviews_count: 60, sector: 'restaurant', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 })
      const phase2 = calculateScore(
        { website_url: 'https://example.com', google_rating: 4.5, google_reviews_count: 60, sector: 'restaurant', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: false, indexedPages: 10 },
        { isResponsive: false, lighthouseScore: 30, hasHttps: false, hasMetaTags: false, indexedPages: 2 }
      )
      expect(phase2.score).toBeGreaterThan(phase1.score)
      expect(phase2.scoring_status).toBe('complete')
    })

    it('ajoute +10 pour fiche Google incomplète en phase 2', () => {
      const complete = calculateScore(
        { website_url: 'https://example.com', google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: true, indexedPages: 10 },
        { isResponsive: true, lighthouseScore: 90, hasHttps: true, hasMetaTags: true, indexedPages: 10 }
      )
      const incomplete = calculateScore(
        { website_url: 'https://example.com', google_rating: 3.0, google_reviews_count: 10, sector: 'autre', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: false, indexedPages: 10 },
        { isResponsive: true, lighthouseScore: 90, hasHttps: true, hasMetaTags: true, indexedPages: 10 }
      )
      expect(incomplete.score - complete.score).toBe(10)
    })

    it('score cappé à 100 même avec tous les malus', () => {
      const result = calculateScore(
        { website_url: 'https://example.com', google_rating: 4.5, google_reviews_count: 60, sector: 'restaurant', google_maps_url: 'https://maps.google.com/test', googleProfileComplete: false, indexedPages: 10 },
        { isResponsive: false, lighthouseScore: 30, hasHttps: false, hasMetaTags: false, indexedPages: 2 }
      )
      expect(result.score).toBeLessThanOrEqual(100)
    })
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npx vitest run
```

Expected: FAIL — `calculateScore` not found.

- [ ] **Step 4: Implémenter calculateScore**

```ts
// lib/scoring.ts
import type { ScoringStatus } from './types/database'

const PRIORITY_SECTORS = ['restaurant', 'resto', 'hôtel', 'hotel', 'artisan', 'commerce', 'boulangerie', 'coiffeur', 'plombier', 'électricien', 'menuisier', 'peintre', 'maçon', 'bar', 'café', 'traiteur', 'fleuriste', 'boucherie', 'garage']

interface PlacesData {
  website_url: string | null
  google_rating: number | null
  google_reviews_count: number
  sector: string | null
  google_maps_url: string | null
  googleProfileComplete: boolean
  indexedPages: number
}

interface AuditData {
  isResponsive: boolean
  lighthouseScore: number
  hasHttps: boolean
  hasMetaTags: boolean
  indexedPages: number
}

interface ScoreResult {
  score: number
  scoring_status: ScoringStatus
}

export function calculateScore(places: PlacesData, audit?: AuditData): ScoreResult {
  let score = 0
  const hasWebsite = !!places.website_url

  if (!hasWebsite) {
    // Branche A — pas de site web
    score += 40

    if (places.google_reviews_count >= 50) score += 10
    if (places.google_rating && places.google_rating > 4.0) score += 5
    if (isPrioritySector(places.sector)) score += 5
    if (!places.googleProfileComplete) score += 10
    if (places.indexedPages < 5) score += 10

    return { score: Math.min(score, 100), scoring_status: 'complete' }
  }

  // Branche B — site web existant
  // Phase 1
  if (places.google_reviews_count >= 50) score += 10
  if (places.google_rating && places.google_rating > 4.0) score += 5
  if (isPrioritySector(places.sector)) score += 5

  if (!audit) {
    return { score: Math.min(score, 100), scoring_status: 'partial' }
  }

  // Phase 2
  if (!audit.isResponsive) score += 25
  if (audit.lighthouseScore < 50) score += 20
  if (!audit.hasHttps) score += 15
  if (!audit.hasMetaTags) score += 10
  if (audit.indexedPages < 5) score += 10
  if (!places.googleProfileComplete) score += 10

  return { score: Math.min(score, 100), scoring_status: 'complete' }
}

function isPrioritySector(sector: string | null): boolean {
  if (!sector) return false
  const lower = sector.toLowerCase()
  return PRIORITY_SECTORS.some(s => lower.includes(s))
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npx vitest run
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add scoring logic with TDD (branches A/B, cap 100)"
```

---

### Task 6: Composants UI partagés

**Files:**
- Create: `components/ui/score-badge.tsx`
- Create: `components/ui/status-badge.tsx`
- Create: `components/ui/stat-card.tsx`

- [ ] **Step 1: ScoreBadge — anneau SVG coloré**

```tsx
// components/ui/score-badge.tsx
interface ScoreBadgeProps {
  score: number
  size?: number
}

export function ScoreBadge({ score, size = 48 }: ScoreBadgeProps) {
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (Math.min(score, 100) / 100) * circumference

  const color = score >= 70 ? '#84cc16' : score >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e1e2e"
          strokeWidth={3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute font-mono text-xs font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: StatusBadge**

```tsx
// components/ui/status-badge.tsx
import type { LeadStatus } from '@/lib/types/database'

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  to_call: { label: 'À appeler', className: 'bg-accent/10 text-accent' },
  contacted: { label: 'Contacté', className: 'bg-warning/10 text-warning' },
  demo_sent: { label: 'Démo envoyée', className: 'bg-purple-500/10 text-purple-400' },
  sold: { label: 'Vendu', className: 'bg-success/10 text-success' },
  refused: { label: 'Refus', className: 'bg-danger/10 text-danger' },
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
```

- [ ] **Step 3: StatCard**

```tsx
// components/ui/stat-card.tsx
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  trend?: string
}

export function StatCard({ label, value, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="card p-4 flex items-start gap-4">
      <div className="p-2 rounded-md bg-accent/10 text-accent">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-text-secondary text-sm">{label}</p>
        <p className="text-2xl font-bold font-mono mt-0.5">{value}</p>
        {trend && <p className="text-xs text-success mt-1">{trend}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add shared UI components (ScoreBadge, StatusBadge, StatCard)"
```

---

## Chunk 3: Module Scraping (Google Places + Audit)

### Task 7: Client Google Places API

**Files:**
- Create: `lib/scraper/google-places.ts`
- Create: `lib/__tests__/google-places.test.ts`

- [ ] **Step 1: Écrire le test unitaire (mock API)**

```ts
// lib/__tests__/google-places.test.ts
import { describe, it, expect, vi } from 'vitest'
import { parsePlaceToLead } from '../scraper/google-places'

describe('parsePlaceToLead', () => {
  it('transforme un résultat Places API en données de lead', () => {
    const place = {
      displayName: { text: 'Boulangerie Dupont' },
      formattedAddress: '12 rue du Port, 64100 Bayonne',
      nationalPhoneNumber: '05 59 12 34 56',
      websiteUri: 'https://boulangerie-dupont.fr',
      googleMapsUri: 'https://maps.google.com/?cid=12345',
      rating: 4.5,
      userRatingCount: 120,
      primaryTypeDisplayName: { text: 'Boulangerie' },
    }

    const lead = parsePlaceToLead(place, 'Bayonne', 'boulangerie')
    expect(lead.company_name).toBe('Boulangerie Dupont')
    expect(lead.phone).toBe('05 59 12 34 56')
    expect(lead.website_url).toBe('https://boulangerie-dupont.fr')
    expect(lead.google_rating).toBe(4.5)
    expect(lead.google_reviews_count).toBe(120)
    expect(lead.city).toBe('Bayonne')
    expect(lead.sector).toBe('boulangerie')
  })

  it('gère les champs manquants', () => {
    const place = {
      displayName: { text: 'Test' },
      formattedAddress: 'Bayonne',
      googleMapsUri: 'https://maps.google.com/?cid=1',
    }

    const lead = parsePlaceToLead(place, 'Bayonne', 'test')
    expect(lead.website_url).toBeNull()
    expect(lead.phone).toBeNull()
    expect(lead.google_rating).toBeNull()
    expect(lead.google_reviews_count).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run lib/__tests__/google-places.test.ts
```

- [ ] **Step 3: Implémenter le client Google Places**

```ts
// lib/scraper/google-places.ts

interface PlaceResult {
  displayName?: { text: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  websiteUri?: string
  googleMapsUri?: string
  rating?: number
  userRatingCount?: number
  primaryTypeDisplayName?: { text: string }
}

interface LeadInsertData {
  company_name: string
  sector: string
  city: string
  address: string | null
  phone: string | null
  website_url: string | null
  google_maps_url: string | null
  google_rating: number | null
  google_reviews_count: number
}

export function parsePlaceToLead(place: PlaceResult, city: string, sector: string): LeadInsertData {
  return {
    company_name: place.displayName?.text ?? 'Inconnu',
    sector,
    city,
    address: place.formattedAddress ?? null,
    phone: place.nationalPhoneNumber ?? null,
    website_url: place.websiteUri ?? null,
    google_maps_url: place.googleMapsUri ?? null,
    google_rating: place.rating ?? null,
    google_reviews_count: place.userRatingCount ?? 0,
  }
}

export async function searchPlaces(city: string, sector: string): Promise<PlaceResult[]> {
  const allResults: PlaceResult[] = []
  const query = `${sector} à ${city}`

  const fieldMask = [
    'places.displayName',
    'places.formattedAddress',
    'places.nationalPhoneNumber',
    'places.websiteUri',
    'places.googleMapsUri',
    'places.rating',
    'places.userRatingCount',
    'places.primaryTypeDisplayName',
  ].join(',')

  let pageToken: string | undefined

  do {
    const body: Record<string, unknown> = { textQuery: query, languageCode: 'fr' }
    if (pageToken) body.pageToken = pageToken

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    if (data.places) {
      allResults.push(...data.places)
    }
    pageToken = data.nextPageToken
  } while (pageToken && allResults.length < 60)

  return allResults
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run lib/__tests__/google-places.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Google Places API client with parsing logic"
```

---

### Task 8: API Route — Lancer un scan

**Files:**
- Create: `app/api/scan/launch/route.ts`

- [ ] **Step 1: Implémenter la route /api/scan/launch**

```ts
// app/api/scan/launch/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { searchPlaces, parsePlaceToLead } from '@/lib/scraper/google-places'
import { calculateScore } from '@/lib/scoring'

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { city, sector } = await request.json()
  if (!city || !sector) {
    return NextResponse.json({ error: 'Ville et secteur requis' }, { status: 400 })
  }

  const db = createServiceClient()

  // Check concurrency — max 1 scan at a time
  const { data: runningJobs } = await db
    .from('scraping_jobs')
    .select('id')
    .eq('status', 'running')
    .limit(1)

  if (runningJobs && runningJobs.length > 0) {
    return NextResponse.json({ error: 'Un scan est déjà en cours' }, { status: 409 })
  }

  // Create job
  const { data: job, error: jobError } = await db
    .from('scraping_jobs')
    .insert({ query_city: city, query_sector: sector, status: 'running', progress: 0 })
    .select()
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Erreur création job' }, { status: 500 })
  }

  // Run scan in background (don't await — return immediately)
  runScan(db, job.id, city, sector).catch(console.error)

  return NextResponse.json({ job_id: job.id })
}

async function runScan(db: any, jobId: string, city: string, sector: string) {
  try {
    // Search places
    await db.from('scraping_jobs').update({ progress: 10 }).eq('id', jobId)
    const places = await searchPlaces(city, sector)

    await db.from('scraping_jobs').update({
      progress: 50,
      leads_found: places.length,
    }).eq('id', jobId)

    // Insert leads with scoring
    let leadsAdded = 0
    for (let i = 0; i < places.length; i++) {
      const leadData = parsePlaceToLead(places[i], city, sector)
      const scoreResult = calculateScore({
        website_url: leadData.website_url,
        google_rating: leadData.google_rating,
        google_reviews_count: leadData.google_reviews_count,
        sector: leadData.sector,
        google_maps_url: leadData.google_maps_url,
        googleProfileComplete: !!(leadData.phone && leadData.address),
        indexedPages: 0, // Will be updated by async audit if site exists
      })

      const { error } = await db
        .from('leads')
        .upsert(
          {
            ...leadData,
            score: scoreResult.score,
            scoring_status: scoreResult.scoring_status,
          },
          { onConflict: 'google_maps_url', ignoreDuplicates: true }
        )

      if (!error) leadsAdded++

      // Update progress
      const progress = 50 + Math.round((i / places.length) * 45)
      await db.from('scraping_jobs').update({
        progress,
        leads_added: leadsAdded,
      }).eq('id', jobId)
    }

    // Done
    await db.from('scraping_jobs').update({
      status: 'completed',
      progress: 100,
      leads_added: leadsAdded,
    }).eq('id', jobId)
  } catch (error: any) {
    await db.from('scraping_jobs').update({
      status: 'error',
      error_message: error.message,
    }).eq('id', jobId)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add /api/scan/launch route with background processing"
```

---

### Task 9: Page Scan (UI)

**Files:**
- Create: `app/(dashboard)/scan/page.tsx`
- Create: `components/scan/search-form.tsx`
- Create: `components/scan/scan-progress.tsx`

- [ ] **Step 1: Créer SearchForm**

```tsx
// components/scan/search-form.tsx
'use client'

interface SearchFormProps {
  onSubmit: (city: string, sector: string) => void
  disabled: boolean
}

const SECTORS = [
  'restaurant', 'boulangerie', 'coiffeur', 'hôtel', 'bar', 'café',
  'plombier', 'électricien', 'menuisier', 'garage', 'fleuriste',
  'boucherie', 'traiteur', 'peintre', 'maçon', 'artisan',
  'commerce', 'boutique', 'institut de beauté', 'dentiste',
  'avocat', 'comptable', 'architecte', 'photographe',
]

export function SearchForm({ onSubmit, disabled }: SearchFormProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    onSubmit(formData.get('city') as string, formData.get('sector') as string)
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <label htmlFor="city" className="block text-sm text-text-secondary mb-1">Ville</label>
        <input
          id="city"
          name="city"
          type="text"
          required
          placeholder="Bayonne, Biarritz, Anglet..."
          className="w-full px-3 py-2 bg-bg border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div className="flex-1">
        <label htmlFor="sector" className="block text-sm text-text-secondary mb-1">Secteur</label>
        <select
          id="sector"
          name="sector"
          required
          className="w-full px-3 py-2 bg-bg border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Choisir un secteur</option>
          {SECTORS.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={disabled}
          className="w-full sm:w-auto px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded-md font-medium transition-colors disabled:opacity-50"
        >
          {disabled ? 'Scan en cours...' : 'Lancer le scan'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Créer ScanProgress**

```tsx
// components/scan/scan-progress.tsx
'use client'

import type { ScrapingJob } from '@/lib/types/database'

export function ScanProgress({ job }: { job: ScrapingJob | null }) {
  if (!job) return null

  const isRunning = job.status === 'running'
  const isError = job.status === 'error'
  const isDone = job.status === 'completed'

  return (
    <div className="card p-6 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {isRunning && `Scan en cours — ${job.query_sector} à ${job.query_city}`}
          {isDone && `Scan terminé — ${job.leads_added} leads ajoutés sur ${job.leads_found} trouvés`}
          {isError && `Erreur : ${job.error_message}`}
        </span>
        <span className="font-mono text-sm text-text-secondary">{job.progress}%</span>
      </div>
      <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isError ? 'bg-danger' : isDone ? 'bg-success' : 'bg-accent'
          }`}
          style={{ width: `${job.progress}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Créer la page Scan**

```tsx
// app/(dashboard)/scan/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SearchForm } from '@/components/scan/search-form'
import { ScanProgress } from '@/components/scan/scan-progress'
import type { ScrapingJob } from '@/lib/types/database'

export default function ScanPage() {
  const [currentJob, setCurrentJob] = useState<ScrapingJob | null>(null)
  const [scanning, setScanning] = useState(false)
  const supabase = createClient()

  // Poll for job updates
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'error') return

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('scraping_jobs')
        .select('*')
        .eq('id', currentJob.id)
        .single()

      if (data) {
        setCurrentJob(data)
        if (data.status === 'completed' || data.status === 'error') {
          setScanning(false)
        }
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [currentJob, supabase])

  async function handleScan(city: string, sector: string) {
    setScanning(true)
    const response = await fetch('/api/scan/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, sector }),
    })

    const data = await response.json()

    if (!response.ok) {
      alert(data.error)
      setScanning(false)
      return
    }

    // Fetch the created job
    const { data: job } = await supabase
      .from('scraping_jobs')
      .select('*')
      .eq('id', data.job_id)
      .single()

    setCurrentJob(job)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Scanner des prospects</h1>
      <SearchForm onSubmit={handleScan} disabled={scanning} />
      <ScanProgress job={currentJob} />
    </div>
  )
}
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add scan page with search form and progress tracking"
```

---

## Chunk 4: Dashboard CRM (Table + Kanban + Détail)

### Task 10: Vue Table des leads

**Files:**
- Create: `app/(dashboard)/leads/page.tsx`
- Create: `components/leads/leads-table.tsx`
- Create: `components/leads/leads-filters.tsx`

- [ ] **Step 1: Créer les filtres**

```tsx
// components/leads/leads-filters.tsx
'use client'

import type { LeadStatus, AssignedTo } from '@/lib/types/database'

interface FiltersState {
  search: string
  status: LeadStatus | ''
  assignedTo: AssignedTo | ''
  city: string
  minScore: number
}

interface LeadsFiltersProps {
  filters: FiltersState
  onChange: (filters: FiltersState) => void
  view: 'table' | 'kanban'
  onViewChange: (view: 'table' | 'kanban') => void
}

export function LeadsFilters({ filters, onChange, view, onViewChange }: LeadsFiltersProps) {
  return (
    <div className="card p-4 flex flex-wrap gap-3 items-center">
      <input
        type="text"
        placeholder="Rechercher..."
        value={filters.search}
        onChange={e => onChange({ ...filters, search: e.target.value })}
        className="px-3 py-1.5 bg-bg border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent w-48"
      />
      <select
        value={filters.status}
        onChange={e => onChange({ ...filters, status: e.target.value as LeadStatus | '' })}
        className="px-3 py-1.5 bg-bg border border-border rounded-md text-sm text-text-primary"
      >
        <option value="">Tous les statuts</option>
        <option value="to_call">À appeler</option>
        <option value="contacted">Contacté</option>
        <option value="demo_sent">Démo envoyée</option>
        <option value="sold">Vendu</option>
        <option value="refused">Refus</option>
      </select>
      <select
        value={filters.assignedTo}
        onChange={e => onChange({ ...filters, assignedTo: e.target.value as AssignedTo | '' })}
        className="px-3 py-1.5 bg-bg border border-border rounded-md text-sm text-text-primary"
      >
        <option value="">Tous</option>
        <option value="jules">Jules</option>
        <option value="ewan">Ewan</option>
      </select>
      <input
        type="text"
        placeholder="Ville..."
        value={filters.city}
        onChange={e => onChange({ ...filters, city: e.target.value })}
        className="px-3 py-1.5 bg-bg border border-border rounded-md text-sm text-text-primary w-32"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-text-secondary">Score min</label>
        <input
          type="number"
          min={0}
          max={100}
          value={filters.minScore}
          onChange={e => onChange({ ...filters, minScore: Number(e.target.value) })}
          className="px-2 py-1.5 bg-bg border border-border rounded-md text-sm text-text-primary w-16 font-mono"
        />
      </div>

      <div className="ml-auto flex gap-1">
        <button
          onClick={() => onViewChange('table')}
          className={`px-3 py-1.5 rounded-md text-sm ${view === 'table' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-hover'}`}
        >
          Table
        </button>
        <button
          onClick={() => onViewChange('kanban')}
          className={`px-3 py-1.5 rounded-md text-sm ${view === 'kanban' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-hover'}`}
        >
          Kanban
        </button>
      </div>
    </div>
  )
}

export type { FiltersState }
```

- [ ] **Step 2: Créer la table**

```tsx
// components/leads/leads-table.tsx
'use client'

import Link from 'next/link'
import type { Lead } from '@/lib/types/database'
import { ScoreBadge } from '@/components/ui/score-badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Phone, ExternalLink } from 'lucide-react'

interface LeadsTableProps {
  leads: Lead[]
}

export function LeadsTable({ leads }: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <div className="card p-12 text-center text-text-secondary">
        Aucun lead trouvé. Lancez un scan pour commencer.
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3 font-medium">Entreprise</th>
            <th className="px-4 py-3 font-medium">Secteur</th>
            <th className="px-4 py-3 font-medium">Ville</th>
            <th className="px-4 py-3 font-medium">Téléphone</th>
            <th className="px-4 py-3 font-medium">Statut</th>
            <th className="px-4 py-3 font-medium">Assigné</th>
            <th className="px-4 py-3 font-medium">Démo</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b border-border/50 hover:bg-bg-hover transition-colors">
              <td className="px-4 py-3">
                <ScoreBadge score={lead.score} size={36} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/leads/${lead.id}`} className="text-text-primary hover:text-accent font-medium">
                  {lead.company_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-text-secondary capitalize">{lead.sector}</td>
              <td className="px-4 py-3 text-text-secondary">{lead.city}</td>
              <td className="px-4 py-3">
                {lead.phone ? (
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-accent hover:underline">
                    <Phone size={14} />
                    {lead.phone}
                  </a>
                ) : (
                  <span className="text-text-secondary">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={lead.status} />
              </td>
              <td className="px-4 py-3 text-text-secondary capitalize">{lead.assigned_to ?? '—'}</td>
              <td className="px-4 py-3">
                {lead.demo_url ? (
                  <a href={lead.demo_url} target="_blank" rel="noopener noreferrer" className="text-success hover:underline flex items-center gap-1">
                    <ExternalLink size={14} />
                    Voir
                  </a>
                ) : (
                  <span className="text-text-secondary text-xs">
                    {lead.demo_status === 'idle' ? '—' : lead.demo_status}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Créer la page Leads avec logique de filtrage**

```tsx
// app/(dashboard)/leads/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LeadsFilters, type FiltersState } from '@/components/leads/leads-filters'
import { LeadsTable } from '@/components/leads/leads-table'
import type { Lead } from '@/lib/types/database'

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [view, setView] = useState<'table' | 'kanban'>('table')
  const [filters, setFilters] = useState<FiltersState>({
    search: '',
    status: '',
    assignedTo: '',
    city: '',
    minScore: 0,
  })
  const supabase = createClient()

  useEffect(() => {
    async function fetchLeads() {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .order('score', { ascending: false })

      if (data) setLeads(data)
    }
    fetchLeads()

    // Realtime subscription
    const channel = supabase
      .channel('leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      if (filters.search) {
        const search = filters.search.toLowerCase()
        const match = lead.company_name.toLowerCase().includes(search) ||
          lead.city?.toLowerCase().includes(search) ||
          lead.sector?.toLowerCase().includes(search)
        if (!match) return false
      }
      if (filters.status && lead.status !== filters.status) return false
      if (filters.assignedTo && lead.assigned_to !== filters.assignedTo) return false
      if (filters.city && !lead.city?.toLowerCase().includes(filters.city.toLowerCase())) return false
      if (lead.score < filters.minScore) return false
      return true
    })
  }, [leads, filters])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Leads</h1>
      <LeadsFilters filters={filters} onChange={setFilters} view={view} onViewChange={setView} />
      {view === 'table' ? (
        <LeadsTable leads={filteredLeads} />
      ) : (
        <div className="text-text-secondary">Kanban — voir Task 11</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add leads table view with filters and realtime sync"
```

---

### Task 11: Vue Kanban

**Files:**
- Create: `components/leads/kanban-board.tsx`
- Create: `components/leads/kanban-card.tsx`
- Create: `components/leads/kanban-column.tsx`

- [ ] **Step 1: Créer KanbanCard**

```tsx
// components/leads/kanban-card.tsx
'use client'

import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Lead } from '@/lib/types/database'
import { ScoreBadge } from '@/components/ui/score-badge'
import { Phone, MapPin } from 'lucide-react'

export function KanbanCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { lead },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="card p-3 space-y-2 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/leads/${lead.id}`} className="font-medium text-sm hover:text-accent">
          {lead.company_name}
        </Link>
        <ScoreBadge score={lead.score} size={32} />
      </div>
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <MapPin size={12} />
        <span>{lead.city}</span>
        <span className="capitalize">· {lead.sector}</span>
      </div>
      {lead.phone && (
        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-accent hover:underline">
          <Phone size={12} />
          {lead.phone}
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Créer KanbanColumn**

```tsx
// components/leads/kanban-column.tsx
'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Lead, LeadStatus } from '@/lib/types/database'
import { KanbanCard } from './kanban-card'

const COLUMN_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  to_call: { label: 'À appeler', color: 'bg-accent' },
  contacted: { label: 'Contacté', color: 'bg-warning' },
  demo_sent: { label: 'Démo envoyée', color: 'bg-purple-500' },
  sold: { label: 'Vendu', color: 'bg-success' },
  refused: { label: 'Refus', color: 'bg-danger' },
}

interface KanbanColumnProps {
  status: LeadStatus
  leads: Lead[]
}

export function KanbanColumn({ status, leads }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const config = COLUMN_CONFIG[status]

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[280px] w-[280px] rounded-lg transition-colors ${
        isOver ? 'bg-bg-hover' : ''
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${config.color}`} />
        <span className="text-sm font-medium">{config.label}</span>
        <span className="ml-auto text-xs text-text-secondary font-mono">{leads.length}</span>
      </div>
      <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 px-1 pb-4 min-h-[200px]">
          {leads.map(lead => (
            <KanbanCard key={lead.id} lead={lead} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
```

- [ ] **Step 3: Créer KanbanBoard**

```tsx
// components/leads/kanban-board.tsx
'use client'

import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { Lead, LeadStatus } from '@/lib/types/database'
import { KanbanColumn } from './kanban-column'
import { createClient } from '@/lib/supabase/client'

const STATUSES: LeadStatus[] = ['to_call', 'contacted', 'demo_sent', 'sold', 'refused']

interface KanbanBoardProps {
  leads: Lead[]
  onLeadUpdate: () => void
}

export function KanbanBoard({ leads, onLeadUpdate }: KanbanBoardProps) {
  const supabase = createClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const leadId = active.id as string
    const newStatus = over.id as LeadStatus

    if (!STATUSES.includes(newStatus)) return

    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.status === newStatus) return

    await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', leadId)

    onLeadUpdate()
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            leads={leads.filter(l => l.status === status)}
          />
        ))}
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 4: Intégrer le Kanban dans la page Leads**

Modifier `app/(dashboard)/leads/page.tsx` : remplacer le placeholder Kanban par :

```tsx
import { KanbanBoard } from '@/components/leads/kanban-board'

// Dans le return, remplacer le div placeholder par :
{view === 'kanban' && (
  <KanbanBoard leads={filteredLeads} onLeadUpdate={() => {
    supabase.from('leads').select('*').order('score', { ascending: false }).then(({ data }) => {
      if (data) setLeads(data)
    })
  }} />
)}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Kanban view with drag-and-drop status changes"
```

---

### Task 12: Fiche lead détaillée

**Files:**
- Create: `app/(dashboard)/leads/[id]/page.tsx`
- Create: `components/leads/lead-detail.tsx`
- Create: `components/leads/generate-button.tsx`

- [ ] **Step 1: Créer GenerateButton**

```tsx
// components/leads/generate-button.tsx
'use client'

import { useState } from 'react'
import type { DemoStatus } from '@/lib/types/database'
import { Sparkles, Loader2, ExternalLink, Copy, AlertCircle } from 'lucide-react'

interface GenerateButtonProps {
  leadId: string
  demoStatus: DemoStatus
  demoUrl: string | null
  demoError: string | null
  onGenerate: () => void
}

export function GenerateButton({ leadId, demoStatus, demoUrl, demoError, onGenerate }: GenerateButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    const res = await fetch(`/api/leads/${leadId}/generate`, { method: 'POST' })
    if (res.ok) onGenerate()
  }

  function copyUrl() {
    if (demoUrl) {
      navigator.clipboard.writeText(demoUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (demoStatus === 'deployed' && demoUrl) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={demoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-md text-sm hover:bg-success/20"
        >
          <ExternalLink size={16} />
          Ouvrir la démo
        </a>
        <button
          onClick={copyUrl}
          className="flex items-center gap-2 px-4 py-2 bg-bg-hover text-text-secondary rounded-md text-sm hover:text-text-primary"
        >
          <Copy size={16} />
          {copied ? 'Copié !' : 'Copier le lien'}
        </button>
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 px-4 py-2 bg-bg-hover text-text-secondary rounded-md text-sm hover:text-text-primary"
        >
          <Sparkles size={16} />
          Regénérer
        </button>
      </div>
    )
  }

  if (['scraping', 'generating', 'deploying'].includes(demoStatus)) {
    const labels = { scraping: 'Scraping de la marque...', generating: 'Génération du site...', deploying: 'Déploiement...' }
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-md text-sm">
        <Loader2 size={16} className="animate-spin" />
        {labels[demoStatus as keyof typeof labels]}
      </div>
    )
  }

  if (demoStatus === 'error') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-danger text-sm">
          <AlertCircle size={16} />
          {demoError || 'Erreur lors de la génération'}
        </div>
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md text-sm"
        >
          <Sparkles size={16} />
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleGenerate}
      className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md text-sm font-medium transition-colors"
    >
      <Sparkles size={16} />
      Générer le site démo
    </button>
  )
}
```

- [ ] **Step 2: Créer la page lead détaillée**

```tsx
// app/(dashboard)/leads/[id]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Lead, LeadStatus, AssignedTo } from '@/lib/types/database'
import { ScoreBadge } from '@/components/ui/score-badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { GenerateButton } from '@/components/leads/generate-button'
import { ArrowLeft, MapPin, Phone, Globe, Star, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function LeadDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [lead, setLead] = useState<Lead | null>(null)

  async function fetchLead() {
    const { data } = await supabase.from('leads').select('*').eq('id', id).single()
    if (data) setLead(data)
  }

  useEffect(() => {
    fetchLead()
    const channel = supabase
      .channel(`lead-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads', filter: `id=eq.${id}` }, () => {
        fetchLead()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function updateLead(updates: Partial<Lead>) {
    await supabase.from('leads').update(updates).eq('id', id)
    fetchLead()
  }

  if (!lead) return <div className="text-text-secondary">Chargement...</div>

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/leads" className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm">
        <ArrowLeft size={16} /> Retour aux leads
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{lead.company_name}</h1>
          <div className="flex items-center gap-3 mt-1 text-text-secondary text-sm">
            {lead.city && <span className="flex items-center gap-1"><MapPin size={14} />{lead.city}</span>}
            {lead.sector && <span className="capitalize">{lead.sector}</span>}
            {lead.google_rating && (
              <span className="flex items-center gap-1">
                <Star size={14} className="text-warning" />
                {lead.google_rating} ({lead.google_reviews_count} avis)
              </span>
            )}
          </div>
        </div>
        <ScoreBadge score={lead.score} size={56} />
      </div>

      {/* Contact */}
      <div className="card p-4 space-y-3">
        <h2 className="font-medium text-sm text-text-secondary uppercase tracking-wide">Contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-accent hover:underline">
              <Phone size={16} />{lead.phone}
            </a>
          )}
          {lead.website_url && (
            <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent hover:underline">
              <Globe size={16} />{lead.website_url}
            </a>
          )}
          {lead.google_maps_url && (
            <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent hover:underline">
              <ExternalLink size={16} />Google Maps
            </a>
          )}
          {lead.address && <p className="text-text-secondary text-sm">{lead.address}</p>}
        </div>
      </div>

      {/* Gestion */}
      <div className="card p-4 space-y-4">
        <h2 className="font-medium text-sm text-text-secondary uppercase tracking-wide">Gestion</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Statut</label>
            <select
              value={lead.status}
              onChange={e => updateLead({ status: e.target.value as LeadStatus })}
              className="w-full px-3 py-1.5 bg-bg border border-border rounded-md text-sm"
            >
              <option value="to_call">À appeler</option>
              <option value="contacted">Contacté</option>
              <option value="demo_sent">Démo envoyée</option>
              <option value="sold">Vendu</option>
              <option value="refused">Refus</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Assigné à</label>
            <select
              value={lead.assigned_to ?? ''}
              onChange={e => updateLead({ assigned_to: (e.target.value || null) as AssignedTo | null })}
              className="w-full px-3 py-1.5 bg-bg border border-border rounded-md text-sm"
            >
              <option value="">Non assigné</option>
              <option value="jules">Jules</option>
              <option value="ewan">Ewan</option>
            </select>
          </div>
          {lead.status === 'sold' && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Prix de vente (EUR)</label>
              <input
                type="number"
                value={lead.sale_price ?? ''}
                onChange={e => updateLead({ sale_price: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-3 py-1.5 bg-bg border border-border rounded-md text-sm font-mono"
                placeholder="0"
              />
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Notes</label>
          <textarea
            value={lead.notes ?? ''}
            onChange={e => updateLead({ notes: e.target.value || null })}
            rows={3}
            className="w-full px-3 py-2 bg-bg border border-border rounded-md text-sm resize-none"
            placeholder="Notes libres..."
          />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Dernier contact</label>
          <input
            type="date"
            value={lead.last_contact_at?.split('T')[0] ?? ''}
            onChange={e => updateLead({ last_contact_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="px-3 py-1.5 bg-bg border border-border rounded-md text-sm"
          />
        </div>
      </div>

      {/* Brand Data */}
      {lead.brand_data && (
        <div className="card p-4 space-y-3">
          <h2 className="font-medium text-sm text-text-secondary uppercase tracking-wide">Données de marque</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-text-secondary mb-1">Couleurs</p>
              <div className="flex gap-2">
                {Object.entries(lead.brand_data.colors).map(([key, color]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: color }} />
                    <span className="text-xs font-mono text-text-secondary">{color}</span>
                  </div>
                ))}
              </div>
            </div>
            {lead.brand_data.logo_url && (
              <div>
                <p className="text-text-secondary mb-1">Logo</p>
                <img src={lead.brand_data.logo_url} alt="Logo" className="h-10 object-contain" />
              </div>
            )}
            {lead.brand_data.services.length > 0 && (
              <div>
                <p className="text-text-secondary mb-1">Services</p>
                <div className="flex flex-wrap gap-1">
                  {lead.brand_data.services.map((s: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-bg-hover rounded text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-text-secondary mb-1">Ton</p>
              <span className="capitalize">{lead.brand_data.tone}</span>
            </div>
          </div>
        </div>
      )}

      {/* Génération de site démo */}
      <div className="card p-4 space-y-3">
        <h2 className="font-medium text-sm text-text-secondary uppercase tracking-wide">Site démo</h2>
        <GenerateButton
          leadId={lead.id}
          demoStatus={lead.demo_status}
          demoUrl={lead.demo_url}
          demoError={lead.demo_error_message}
          onGenerate={fetchLead}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add lead detail page with editable fields and generate button"
```

---

### Task 13: Dashboard stats + page Statistiques

**Files:**
- Modify: `app/(dashboard)/page.tsx`
- Create: `app/(dashboard)/stats/page.tsx`

- [ ] **Step 1: Dashboard avec stats**

```tsx
// app/(dashboard)/page.tsx
import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'
import { Users, PhoneCall, DollarSign, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { count: totalLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true })

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: contactedThisWeek } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .gte('last_contact_at', weekAgo)

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data: soldThisMonth } = await supabase
    .from('leads')
    .select('sale_price')
    .eq('status', 'sold')
    .gte('created_at', monthStart)

  const salesCount = soldThisMonth?.length ?? 0
  const totalRevenue = soldThisMonth?.reduce((sum, l) => sum + (l.sale_price ?? 0), 0) ?? 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total leads" value={totalLeads ?? 0} icon={Users} />
        <StatCard label="Contactés cette semaine" value={contactedThisWeek ?? 0} icon={PhoneCall} />
        <StatCard label="Vendus ce mois" value={salesCount} icon={TrendingUp} />
        <StatCard label="CA ce mois" value={`${totalRevenue.toLocaleString('fr-FR')} €`} icon={DollarSign} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Page Statistiques détaillées**

```tsx
// app/(dashboard)/stats/page.tsx
import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'
import { Users, DollarSign } from 'lucide-react'

export default async function StatsPage() {
  const supabase = await createClient()

  const { data: allSold } = await supabase
    .from('leads')
    .select('assigned_to, sale_price')
    .eq('status', 'sold')

  const stats = {
    jules: { count: 0, revenue: 0 },
    ewan: { count: 0, revenue: 0 },
  }

  allSold?.forEach(lead => {
    const who = lead.assigned_to as 'jules' | 'ewan'
    if (who && stats[who]) {
      stats[who].count++
      stats[who].revenue += lead.sale_price ?? 0
    }
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Statistiques</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(['jules', 'ewan'] as const).map(name => (
          <div key={name} className="card p-6 space-y-4">
            <h2 className="text-lg font-bold capitalize">{name}</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Ventes" value={stats[name].count} icon={Users} />
              <StatCard label="CA total" value={`${stats[name].revenue.toLocaleString('fr-FR')} €`} icon={DollarSign} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add dashboard stats and Jules/Ewan comparison page"
```

---

## Chunk 5: Module Génération (Brand Scraping + Claude + Vercel Deploy)

### Task 14: Brand Scraper

**Files:**
- Create: `lib/scraper/brand-scraper.ts`

- [ ] **Step 1: Implémenter le brand scraper**

```ts
// lib/scraper/brand-scraper.ts
import type { BrandData } from '@/lib/types/database'

const SECTOR_PALETTES: Record<string, { primary: string; secondary: string; accent: string }> = {
  restaurant: { primary: '#1a1a2e', secondary: '#e94560', accent: '#0f3460' },
  boulangerie: { primary: '#4a3728', secondary: '#d4a574', accent: '#8b6914' },
  coiffeur: { primary: '#2d2d2d', secondary: '#c9a96e', accent: '#8b5e3c' },
  hotel: { primary: '#1b2838', secondary: '#c9b037', accent: '#2c5f7c' },
  default: { primary: '#1a1a2e', secondary: '#3b82f6', accent: '#8b5cf6' },
}

export async function scrapeBrand(
  companyName: string,
  websiteUrl: string | null,
  googleMapsUrl: string | null,
  phone: string | null,
  address: string | null,
  sector: string | null,
): Promise<BrandData> {
  const brand: BrandData = {
    name: companyName,
    tagline: null,
    description: '',
    services: [],
    values: [],
    tone: 'professionnel',
    colors: SECTOR_PALETTES[sector?.toLowerCase() ?? ''] ?? SECTOR_PALETTES.default,
    logo_url: null,
    images: [],
    contact: {
      phone: phone ?? '',
      email: null,
      address: address ?? '',
      hours: null,
    },
    social: { instagram: null, facebook: null },
    reviews: [],
  }

  // Scrape website if available
  if (websiteUrl) {
    try {
      const siteData = await scrapeWebsite(websiteUrl)
      if (siteData.description) brand.description = siteData.description
      if (siteData.colors) brand.colors = siteData.colors
      if (siteData.logo) brand.logo_url = siteData.logo
      if (siteData.images.length > 0) brand.images = siteData.images
      if (siteData.email) brand.contact.email = siteData.email
    } catch (e) {
      console.error('Website scrape failed:', e)
    }
  }

  // Scrape Google Maps via Serper
  try {
    const mapsData = await scrapeGoogleInfo(companyName, sector)
    if (mapsData.description && !brand.description) brand.description = mapsData.description
    if (mapsData.reviews.length > 0) brand.reviews = mapsData.reviews
  } catch (e) {
    console.error('Google scrape failed:', e)
  }

  // Generate description fallback
  if (!brand.description) {
    brand.description = `${companyName} est un(e) ${sector ?? 'entreprise'} situé(e) à ${address ?? 'votre ville'}.`
  }

  // Detect tone from sector
  if (sector) {
    const s = sector.toLowerCase()
    if (['restaurant', 'bar', 'café', 'boulangerie', 'traiteur'].some(t => s.includes(t))) {
      brand.tone = 'chaleureux'
    } else if (['hôtel', 'hotel', 'spa'].some(t => s.includes(t))) {
      brand.tone = 'premium'
    } else if (['artisan', 'menuisier', 'maçon', 'plombier', 'peintre'].some(t => s.includes(t))) {
      brand.tone = 'artisanal'
    }
  }

  return brand
}

async function scrapeWebsite(url: string) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })

    const data = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="description"]')
      const description = meta?.getAttribute('content') ?? ''

      // Extract colors from CSS
      const body = getComputedStyle(document.body)
      const bg = body.backgroundColor

      // Find logo
      const logoSelectors = ['img[alt*="logo" i]', 'header img', '.logo img', 'a[class*="logo"] img']
      let logo: string | null = null
      for (const sel of logoSelectors) {
        const el = document.querySelector(sel) as HTMLImageElement
        if (el?.src) { logo = el.src; break }
      }

      // Find images
      const images = Array.from(document.querySelectorAll('img'))
        .map(img => img.src)
        .filter(src => src.startsWith('http') && !src.includes('icon') && !src.includes('logo'))
        .slice(0, 6)

      // Find email
      const emailMatch = document.body.innerHTML.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
      const email = emailMatch?.[0] ?? null

      return { description, logo, images, email }
    })

    return { ...data, colors: null as any }
  } finally {
    await browser.close()
  }
}

async function scrapeGoogleInfo(companyName: string, sector: string | null) {
  const query = `${companyName} ${sector ?? ''} avis`
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, gl: 'fr', hl: 'fr' }),
  })

  if (!response.ok) return { description: '', reviews: [] }

  const data = await response.json()
  const description = data.knowledgeGraph?.description ?? ''
  const reviews = (data.knowledgeGraph?.reviews ?? [])
    .slice(0, 5)
    .map((r: any) => ({
      text: r.snippet ?? r.text ?? '',
      rating: r.rating ?? 5,
      author: r.author ?? 'Client',
    }))

  return { description, reviews }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add brand scraper (website + Google info via Serper)"
```

---

### Task 15: Claude Site Generator

**Files:**
- Create: `lib/generator/claude-generate.ts`

- [ ] **Step 1: Implémenter le générateur Claude**

```ts
// lib/generator/claude-generate.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Claude site generator with validation and retry"
```

---

### Task 16: Vercel Deployer

**Files:**
- Create: `lib/generator/vercel-deploy.ts`

- [ ] **Step 1: Implémenter le déploiement Vercel REST API**

```ts
// lib/generator/vercel-deploy.ts
import slugify from 'slugify'

interface DeployFile {
  path: string
  content: string
}

interface DeployResult {
  url: string
  deploymentId: string
}

export async function deployToVercel(companyName: string, files: DeployFile[]): Promise<DeployResult> {
  const slug = slugify(companyName, { lower: true, strict: true })
  const projectName = `demo-${slug}`

  const vercelFiles = files.map(file => ({
    file: file.path,
    data: Buffer.from(file.content).toString('base64'),
    encoding: 'base64' as const,
  }))

  const response = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      files: vercelFiles,
      projectSettings: {
        framework: 'nextjs',
        buildCommand: 'next build',
        outputDirectory: '.next',
      },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Vercel deploy failed: ${errorData.error?.message ?? response.statusText}`)
  }

  const data = await response.json()

  return {
    url: `https://${data.url}`,
    deploymentId: data.id,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Vercel deployment via REST API"
```

---

### Task 17: API Route — Pipeline de génération complète

**Files:**
- Create: `app/api/leads/[id]/generate/route.ts`

- [ ] **Step 1: Implémenter la route /api/leads/[id]/generate**

```ts
// app/api/leads/[id]/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { scrapeBrand } from '@/lib/scraper/brand-scraper'
import { generateSite } from '@/lib/generator/claude-generate'
import { deployToVercel } from '@/lib/generator/vercel-deploy'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const db = createServiceClient()
  const { id } = params

  // Fetch lead
  const { data: lead, error } = await db.from('leads').select('*').eq('id', id).single()
  if (error || !lead) {
    return NextResponse.json({ error: 'Lead non trouvé' }, { status: 404 })
  }

  // Check concurrency
  const { data: generating } = await db
    .from('leads')
    .select('id')
    .in('demo_status', ['scraping', 'generating', 'deploying'])
    .limit(1)

  if (generating && generating.length > 0 && generating[0].id !== id) {
    return NextResponse.json({ error: 'Une génération est déjà en cours' }, { status: 409 })
  }

  // Reset status
  await db.from('leads').update({
    demo_status: 'scraping',
    demo_error_message: null,
  }).eq('id', id)

  // Run pipeline in background
  runPipeline(db, id, lead).catch(console.error)

  return NextResponse.json({ status: 'started' })
}

async function runPipeline(db: any, leadId: string, lead: any) {
  try {
    // Step 1: Scrape brand
    const brandData = await scrapeBrand(
      lead.company_name,
      lead.website_url,
      lead.google_maps_url,
      lead.phone,
      lead.address,
      lead.sector,
    )

    await db.from('leads').update({
      demo_status: 'generating',
      brand_data: brandData,
    }).eq('id', leadId)

    // Step 2: Generate site with Claude
    const result = await generateSite(brandData)

    await db.from('leads').update({
      demo_status: 'deploying',
    }).eq('id', leadId)

    // Step 3: Deploy to Vercel
    const deployment = await deployToVercel(lead.company_name, result.files)

    // Step 4: Done
    await db.from('leads').update({
      demo_status: 'deployed',
      demo_url: deployment.url,
      demo_generated_at: new Date().toISOString(),
    }).eq('id', leadId)
  } catch (error: any) {
    await db.from('leads').update({
      demo_status: 'error',
      demo_error_message: error.message?.slice(0, 500),
    }).eq('id', leadId)
  }
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add full generation pipeline (scrape → Claude → Vercel deploy)"
```

---

## Chunk 6: Site Analyzer (Audit Playwright) + Finitions

### Task 18: Site Analyzer (audit Playwright async)

**Files:**
- Create: `lib/scraper/site-analyzer.ts`
- Create: `app/api/scan/analyze/route.ts`

- [ ] **Step 1: Implémenter le site analyzer**

```ts
// lib/scraper/site-analyzer.ts
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
    // <2s = 90+, 2-4s = 60-90, 4-6s = 30-60, >6s = 0-30
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
```

- [ ] **Step 2: Créer la route API /api/scan/analyze**

```ts
// app/api/scan/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { analyzeSite } from '@/lib/scraper/site-analyzer'
import { calculateScore } from '@/lib/scoring'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { lead_id } = await request.json()
  if (!lead_id) {
    return NextResponse.json({ error: 'lead_id requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: lead } = await db.from('leads').select('*').eq('id', lead_id).single()

  if (!lead || !lead.website_url) {
    return NextResponse.json({ error: 'Lead ou site web non trouvé' }, { status: 404 })
  }

  try {
    const domain = new URL(lead.website_url).hostname
    const audit = await analyzeSite(lead.website_url, domain)

    // Recalculate score with audit data
    const scoreResult = calculateScore(
      {
        website_url: lead.website_url,
        google_rating: lead.google_rating,
        google_reviews_count: lead.google_reviews_count,
        sector: lead.sector,
        google_maps_url: lead.google_maps_url,
        googleProfileComplete: !!(lead.phone && lead.address),
        indexedPages: audit.indexedPages,
      },
      audit
    )

    await db.from('leads').update({
      score: scoreResult.score,
      scoring_status: 'complete',
    }).eq('id', lead_id)

    return NextResponse.json({ audit, score: scoreResult.score })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add site analyzer (Playwright audit + Serper indexed pages)"
```

---

### Task 19: Trigger audit async après le scan

**Files:**
- Modify: `app/api/scan/launch/route.ts`

- [ ] **Step 1: Ajouter le déclenchement de l'audit après insertion des leads**

Dans la fonction `runScan` de `app/api/scan/launch/route.ts`, après la boucle d'insertion des leads, ajouter :

```ts
    // Trigger async audit for leads with websites
    const { data: leadsWithSites } = await db
      .from('leads')
      .select('*')
      .eq('scoring_status', 'partial')
      .not('website_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20)

    if (leadsWithSites) {
      for (const lead of leadsWithSites) {
        try {
          const domain = new URL(lead.website_url).hostname
          const { analyzeSite } = await import('@/lib/scraper/site-analyzer')
          const audit = await analyzeSite(lead.website_url, domain)

          const { calculateScore } = await import('@/lib/scoring')
          const scoreResult = calculateScore(
            {
              website_url: lead.website_url,
              google_rating: lead.google_rating,
              google_reviews_count: lead.google_reviews_count,
              sector: lead.sector,
              google_maps_url: lead.google_maps_url,
              googleProfileComplete: !!(lead.phone && lead.address),
              indexedPages: audit.indexedPages,
            },
            audit
          )

          await db.from('leads').update({
            score: scoreResult.score,
            scoring_status: 'complete',
          }).eq('id', lead.id)
        } catch (e) {
          console.error(`Audit failed for lead ${lead.id}:`, e)
        }
      }
    }
```

Place this code just before the "Done" comment in the `runScan` function.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: trigger async site audit for leads with websites after scan"
```

---

### Task 20: Sidebar collapse state persistence + final polish

**Files:**
- Modify: `app/(dashboard)/layout.tsx` — handle sidebar collapse for main padding
- Modify: `components/ui/sidebar.tsx` — persist collapse in localStorage

- [ ] **Step 1: Persister l'état collapsed dans localStorage**

Dans `components/ui/sidebar.tsx`, modifier le useState :

```tsx
const [collapsed, setCollapsed] = useState(() => {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('sidebar-collapsed') === 'true'
})

function toggleCollapsed() {
  const next = !collapsed
  setCollapsed(next)
  localStorage.setItem('sidebar-collapsed', String(next))
}
```

Remplacer `onClick={() => setCollapsed(!collapsed)}` par `onClick={toggleCollapsed}`.

- [ ] **Step 2: Mettre à jour le layout pour gérer la marge dynamique**

Modifier `app/(dashboard)/layout.tsx` pour utiliser un contexte ou simplement la même valeur par défaut (240px) puisque le sidebar gère son propre état.

- [ ] **Step 3: Run final build check**

```bash
npm run build
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: persist sidebar collapse state in localStorage"
```

---

### Task 21: Build complet + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Créer le README**

```markdown
# Ew X Jul — Plateforme de Prospection

Plateforme interne de prospection et génération de sites web démo.

## Setup

1. Cloner le repo
2. `npm install`
3. Copier `.env.local.example` en `.env.local` et remplir les clés
4. Exécuter la migration SQL dans Supabase Dashboard (fichier `supabase/migrations/001_initial_schema.sql`)
5. Créer 2 utilisateurs dans Supabase Auth Dashboard (Jules + Ewan)
6. `npm run dev`

## Variables d'environnement requises

| Variable | Description |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | URL du projet Supabase |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Clé anon Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Clé service role Supabase |
| ANTHROPIC_API_KEY | Clé API Anthropic (Claude) |
| VERCEL_TOKEN | Token API Vercel |
| GOOGLE_PLACES_API_KEY | Clé API Google Places |
| SERPER_API_KEY | Clé API Serper.dev |

## Architecture

- `/app/(dashboard)` — Pages du dashboard (stats, leads, scan, stats)
- `/app/api` — API Routes (scan, analyze, generate)
- `/lib/scraper` — Google Places, site analyzer, brand scraper
- `/lib/generator` — Claude site generator, Vercel deployer
- `/lib/scoring.ts` — Logique de scoring /100
- `/components` — Composants React (UI, leads, scan, dashboard)

## Commandes

- `npm run dev` — Serveur de développement
- `npm run build` — Build production
- `npm test` — Tests unitaires (vitest)

## Notes

- Playwright nécessite un navigateur. En local : `npx playwright install chromium`
- L'audit de site (Playwright) ne fonctionne pas sur Vercel serverless. Utiliser un serveur long-running en prod.
```

- [ ] **Step 2: Installer Playwright chromium**

```bash
npx playwright install chromium
```

- [ ] **Step 3: Final build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add README with setup instructions"
```
