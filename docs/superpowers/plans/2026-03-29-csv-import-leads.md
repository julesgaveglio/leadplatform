# CSV Import Leads — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un onglet "Import CSV" dans la page `/leads` avec un wizard 2 étapes : upload + mapping intelligent des colonnes → preview + insertion Supabase.

**Architecture:** Nouveau composant `LeadsImport` entièrement côté client. PapaParse parse le CSV dans le navigateur. Auto-mapping des headers via table de synonymes. Insert row-by-row via `Promise.allSettled`. Détection doublons contre le tableau `leads[]` complet non filtré du parent.

**Tech Stack:** Next.js 14 App Router, Supabase JS client, PapaParse, TypeScript, Tailwind CSS

---

## Chunk 1: Dépendance + types + utilitaire de mapping

### Task 1: Installer PapaParse

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Installer la dépendance**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npm install papaparse @types/papaparse
```

Expected output: `added N packages`

- [ ] **Step 2: Vérifier que TypeScript accepte l'import**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1 | head -20
```

Expected: pas d'erreur liée à papaparse

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add papaparse for CSV parsing"
```

---

### Task 2: Utilitaire de mapping CSV → champs Lead

**Files:**
- Create: `lib/csv-import.ts`

- [ ] **Step 1: Créer l'utilitaire**

Créer `lib/csv-import.ts` avec le contenu suivant :

```typescript
import type { Lead, LeadStatus, AssignedTo, Country } from '@/lib/types/database'

// Champs importables (subset de Lead, sans les champs auto-générés)
export type ImportableLeadField =
  | 'company_name' | 'phone' | 'city' | 'address'
  | 'website_url' | 'sector' | 'notes' | 'country'
  | 'owner_name' | 'score' | 'assigned_to' | 'ignore'

export const IMPORTABLE_FIELDS: { value: ImportableLeadField; label: string }[] = [
  { value: 'company_name', label: 'Nom de la société *' },
  { value: 'phone',        label: 'Téléphone' },
  { value: 'city',         label: 'Ville' },
  { value: 'address',      label: 'Adresse' },
  { value: 'website_url',  label: 'Site web' },
  { value: 'sector',       label: 'Secteur' },
  { value: 'notes',        label: 'Notes' },
  { value: 'country',      label: 'Pays' },
  { value: 'owner_name',   label: 'Gérant / Propriétaire' },
  { value: 'score',        label: 'Score' },
  { value: 'assigned_to',  label: 'Assigné à' },
  { value: 'ignore',       label: '— Ignorer —' },
]

// Table de synonymes : clé normalisée → champ Lead
const SYNONYMS: Record<string, ImportableLeadField> = {
  // company_name
  nom: 'company_name', company: 'company_name', societe: 'company_name',
  name: 'company_name', entreprise: 'company_name', 'raison sociale': 'company_name',
  'raison_sociale': 'company_name', company_name: 'company_name',
  // phone
  telephone: 'phone', tel: 'phone', phone: 'phone', 'téléphone': 'phone',
  // city
  ville: 'city', city: 'city',
  // address
  adresse: 'address', address: 'address',
  // website_url
  site: 'website_url', website: 'website_url', url: 'website_url',
  'site web': 'website_url', 'site_web': 'website_url', website_url: 'website_url',
  // sector
  secteur: 'sector', sector: 'sector', activite: 'sector', 'activité': 'sector',
  // notes
  note: 'notes', notes: 'notes', commentaire: 'notes', commentaires: 'notes',
  // country
  pays: 'country', country: 'country',
  // owner_name
  gerant: 'owner_name', 'gérant': 'owner_name', proprietaire: 'owner_name',
  'propriétaire': 'owner_name', owner_name: 'owner_name', owner: 'owner_name',
  // score
  score: 'score',
  // assigned_to
  assigne: 'assigned_to', 'assigné': 'assigned_to',
  assigned_to: 'assigned_to', assigned: 'assigned_to',
}

/** Normalise un header CSV : lowercase, trim, supprime accents */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Retourne le champ Lead correspondant à un header CSV, ou 'ignore' */
export function autoDetectField(header: string): ImportableLeadField {
  const normalized = normalizeHeader(header)
  return SYNONYMS[normalized] ?? 'ignore'
}

/** Normalise une valeur `country` vers 'fr' | 'nz' */
export function normalizeCountry(value: string): Country {
  const v = value.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (v === 'nz' || v === 'nouvelle-zelande' || v === 'new zealand' || v === 'newzealand') return 'nz'
  return 'fr'
}

/** Normalise une valeur `assigned_to` vers 'jules' | 'ewan' | null */
export function normalizeAssignedTo(value: string): AssignedTo | null {
  const v = value.toLowerCase().trim()
  if (v === 'jules') return 'jules'
  if (v === 'ewan') return 'ewan'
  return null
}

export type MappingEntry = { csvHeader: string; field: ImportableLeadField; autoDetected: boolean }

/** Génère le mapping initial à partir des headers CSV */
export function buildInitialMapping(headers: string[]): MappingEntry[] {
  return headers.map(header => {
    const field = autoDetectField(header)
    return { csvHeader: header, field, autoDetected: field !== 'ignore' }
  })
}

export type RawRow = Record<string, string>
export type MappedLead = Omit<Lead,
  'id' | 'created_at' | 'demo_url' | 'demo_status' | 'demo_error_message' |
  'demo_generated_at' | 'last_contact_at' | 'brand_data' | 'scoring_status' |
  'sale_price' | 'google_maps_url' | 'google_rating' | 'status'
> & {
  status: LeadStatus
  scoring_status: 'partial'
  demo_status: 'idle'
  google_reviews_count: number
  google_rating: null
  sale_price: null
  google_maps_url: null
  brand_data: null
  demo_url: null
  demo_error_message: null
  demo_generated_at: null
  last_contact_at: null
}

/** Convertit une ligne CSV brute en objet lead prêt à insérer */
export function mapRowToLead(row: RawRow, mapping: MappingEntry[]): MappedLead {
  const partial: Record<string, unknown> = {}

  for (const { csvHeader, field } of mapping) {
    if (field === 'ignore') continue
    const rawValue = row[csvHeader]?.trim() ?? ''
    if (!rawValue) continue

    if (field === 'country') {
      partial.country = normalizeCountry(rawValue)
    } else if (field === 'assigned_to') {
      partial.assigned_to = normalizeAssignedTo(rawValue)
    } else if (field === 'score') {
      const n = parseInt(rawValue, 10)
      partial.score = isNaN(n) ? 0 : n
    } else {
      partial[field] = rawValue
    }
  }

  return {
    company_name: (partial.company_name as string) ?? '',
    phone: (partial.phone as string) ?? null,
    city: (partial.city as string) ?? null,
    address: (partial.address as string) ?? null,
    website_url: (partial.website_url as string) ?? null,
    sector: (partial.sector as string) ?? null,
    notes: (partial.notes as string) ?? null,
    country: (partial.country as Country) ?? 'fr',
    owner_name: (partial.owner_name as string) ?? null,
    score: (partial.score as number) ?? 0,
    assigned_to: (partial.assigned_to as AssignedTo | null) ?? null,
    // defaults
    status: 'to_call',
    scoring_status: 'partial',
    demo_status: 'idle',
    google_reviews_count: 0,
    google_rating: null,
    sale_price: null,
    google_maps_url: null,
    brand_data: null,
    demo_url: null,
    demo_error_message: null,
    demo_generated_at: null,
    last_contact_at: null,
  }
}

/** Détecte si un lead mappé est doublon d'un lead existant */
export function isDuplicate(mapped: MappedLead, existingLeads: Lead[]): boolean {
  const name = mapped.company_name.toLowerCase().trim()
  const city = mapped.city?.toLowerCase().trim() ?? null
  return existingLeads.some(l => {
    const lName = l.company_name.toLowerCase().trim()
    const lCity = l.city?.toLowerCase().trim() ?? null
    return lName === name && lCity === city
  })
}

/** Génère et télécharge un CSV modèle vide */
export function downloadTemplateCsv() {
  const headers = [
    'company_name', 'phone', 'city', 'address', 'website_url',
    'sector', 'notes', 'country', 'owner_name', 'score', 'assigned_to',
  ]
  const csv = headers.join(',') + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'leads-modele.csv'
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1 | grep csv-import
```

Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add lib/csv-import.ts
git commit -m "feat: add CSV mapping utilities (autoDetect, normalize, mapRowToLead)"
```

---

## Chunk 2: Composant LeadsImport

### Task 3: Créer le composant wizard `LeadsImport`

**Files:**
- Create: `components/leads/leads-import.tsx`

- [ ] **Step 1: Créer le composant**

Créer `components/leads/leads-import.tsx` :

```tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import { Upload, FileText, ArrowRight, ArrowLeft, Download, Check, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Lead } from '@/lib/types/database'
import {
  buildInitialMapping, mapRowToLead, isDuplicate, downloadTemplateCsv,
  IMPORTABLE_FIELDS,
  type MappingEntry, type RawRow, type ImportableLeadField,
} from '@/lib/csv-import'

interface LeadsImportProps {
  allLeads: Lead[]
  onLeadsImported: () => void
  onSwitchToTable: () => void
}

type Step = 'upload' | 'mapping' | 'preview'

export function LeadsImport({ allLeads, onLeadsImported, onSwitchToTable }: LeadsImportProps) {
  const [step, setStep] = useState<Step>('upload')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Parsed CSV state
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<RawRow[]>([])
  const [mapping, setMapping] = useState<MappingEntry[]>([])

  // Import state
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    setError(null)
    setImportResult(null)

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Seuls les fichiers .csv sont acceptés.')
      return
    }

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        if (!results.meta.fields || results.meta.fields.length === 0) {
          setError('CSV vide ou sans en-têtes.')
          return
        }
        if (results.data.length > 500) {
          setError('Fichier trop volumineux (max 500 leads par import).')
          return
        }
        setHeaders(results.meta.fields)
        setRows(results.data)
        setMapping(buildInitialMapping(results.meta.fields))
        setStep('mapping')
      },
      error() {
        setError('Impossible de lire ce fichier CSV.')
      },
    })
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  function updateMapping(index: number, field: ImportableLeadField) {
    setMapping(prev => prev.map((m, i) => i === index ? { ...m, field, autoDetected: false } : m))
  }

  const canPreview = mapping.some(m => m.field === 'company_name')

  // Compute mapped leads + duplicates for preview
  const mappedRows = rows.map(row => mapRowToLead(row, mapping))
  const duplicateCount = mappedRows.filter(r => isDuplicate(r, allLeads)).length
  const toImport = mappedRows.filter(r => !isDuplicate(r, allLeads) && r.company_name.trim() !== '')

  async function handleImport() {
    setImporting(true)
    const supabase = createClient()
    const results = await Promise.allSettled(
      toImport.map(lead =>
        supabase.from('leads').insert(lead).then(({ error }) => {
          if (error) throw error
        })
      )
    )
    const success = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    setImporting(false)
    setImportResult({ success, failed })
    onLeadsImported()
    if (failed === 0) {
      setTimeout(() => {
        onSwitchToTable()
        resetWizard()
      }, 1500)
    }
  }

  function resetWizard() {
    setStep('upload')
    setError(null)
    setHeaders([])
    setRows([])
    setMapping([])
    setImportResult(null)
  }

  // ── STEP: UPLOAD ──────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="card p-8 flex flex-col items-center gap-6 max-w-lg mx-auto mt-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-text-primary">Importer des leads via CSV</h2>
          <p className="text-sm text-text-secondary mt-1">Glissez un fichier ou cliquez pour le sélectionner</p>
        </div>

        <div
          className={`w-full border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
            isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-bg-hover'
          }`}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={32} className="text-text-secondary" />
          <span className="text-sm text-text-secondary">Fichier .csv (max 500 lignes)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-danger text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <button
          onClick={downloadTemplateCsv}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors"
        >
          <Download size={14} />
          Télécharger un modèle CSV
        </button>
      </div>
    )
  }

  // ── STEP: MAPPING ─────────────────────────────────────────────
  if (step === 'mapping') {
    return (
      <div className="card p-6 flex flex-col gap-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Mapper les colonnes</h2>
            <p className="text-sm text-text-secondary mt-0.5">{rows.length} lignes détectées — {headers.length} colonnes</p>
          </div>
          <button onClick={resetWizard} className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
            <ArrowLeft size={14} /> Changer de fichier
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-text-secondary font-medium">Colonne CSV</th>
                <th className="text-left py-2 px-3 text-text-secondary font-medium">Exemple</th>
                <th className="text-left py-2 px-3 text-text-secondary font-medium">Champ Lead</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {mapping.map((m, i) => (
                <tr key={m.csvHeader} className="border-b border-border/50">
                  <td className="py-2 px-3 font-mono text-text-primary">{m.csvHeader}</td>
                  <td className="py-2 px-3 text-text-secondary truncate max-w-[160px]">
                    {rows[0]?.[m.csvHeader] ?? '—'}
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={m.field}
                      onChange={e => updateMapping(i, e.target.value as ImportableLeadField)}
                      className="px-2 py-1 bg-bg border border-border rounded text-sm text-text-primary w-full"
                    >
                      {IMPORTABLE_FIELDS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    {m.autoDetected && m.field !== 'ignore' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">Auto</span>
                    )}
                    {!m.autoDetected && m.field !== 'ignore' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">Manuel</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!canPreview && (
          <p className="text-sm text-warning flex items-center gap-2">
            <AlertCircle size={14} /> Mappez au moins la colonne "Nom de la société" pour continuer.
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => setStep('preview')}
            disabled={!canPreview}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Prévisualiser <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  // ── STEP: PREVIEW ─────────────────────────────────────────────
  return (
    <div className="card p-6 flex flex-col gap-6 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Prévisualisation</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-success font-medium">{toImport.length} leads à importer</span>
            {duplicateCount > 0 && (
              <span className="text-sm text-text-secondary">{duplicateCount} doublons ignorés</span>
            )}
          </div>
        </div>
        <button onClick={() => setStep('mapping')} className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft size={14} /> Modifier le mapping
        </button>
      </div>

      {importResult && (
        <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${
          importResult.failed === 0 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
        }`}>
          <Check size={16} />
          {importResult.success} importés{importResult.failed > 0 ? `, ${importResult.failed} échoués` : ' — redirection...'}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {mapping.filter(m => m.field !== 'ignore').map(m => (
                <th key={m.csvHeader} className="text-left py-2 px-3 text-text-secondary font-medium whitespace-nowrap">
                  {m.field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {toImport.slice(0, 10).map((lead, i) => (
              <tr key={i} className="border-b border-border/50">
                {mapping.filter(m => m.field !== 'ignore').map(m => (
                  <td key={m.csvHeader} className="py-2 px-3 text-text-primary truncate max-w-[200px]">
                    {String((lead as Record<string, unknown>)[m.field] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {toImport.length > 10 && (
          <p className="text-xs text-text-secondary mt-2 px-3">… et {toImport.length - 10} autres lignes</p>
        )}
      </div>

      <div className="flex justify-between items-center">
        <button onClick={resetWizard} className="text-sm text-text-secondary hover:text-text-primary">
          Recommencer
        </button>
        <button
          onClick={handleImport}
          disabled={importing || toImport.length === 0 || !!importResult}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {importing ? 'Import en cours…' : `Importer ${toImport.length} leads`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1 | grep -E "(leads-import|csv-import)"
```

Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add components/leads/leads-import.tsx
git commit -m "feat: add LeadsImport wizard component (upload, mapping, preview)"
```

---

## Chunk 3: Intégration dans la page leads

### Task 4: Mettre à jour `LeadsFilters` pour accepter le type étendu

**Files:**
- Modify: `components/leads/leads-filters.tsx`

- [ ] **Step 1: Étendre le type `view`**

Dans `components/leads/leads-filters.tsx`, remplacer les deux occurrences du type `'table' | 'kanban'` :

```tsx
// Ancien
interface LeadsFiltersProps {
  filters: FiltersState
  onChange: (filters: FiltersState) => void
  view: 'table' | 'kanban'
  onViewChange: (view: 'table' | 'kanban') => void
}
```

```tsx
// Nouveau
interface LeadsFiltersProps {
  filters: FiltersState
  onChange: (filters: FiltersState) => void
  view: 'table' | 'kanban' | 'import'
  onViewChange: (view: 'table' | 'kanban' | 'import') => void
}
```

Et masquer les filtres de recherche quand `view === 'import'` (garder seulement les boutons de vue) :

```tsx
export function LeadsFilters({ filters, onChange, view, onViewChange }: LeadsFiltersProps) {
  return (
    <div className="card p-4 flex flex-wrap gap-3 items-center">
      {view !== 'import' && (
        <>
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
        </>
      )}

      <div className={`${view !== 'import' ? 'ml-auto' : ''} flex gap-1`}>
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
        <button
          onClick={() => onViewChange('import')}
          className={`px-3 py-1.5 rounded-md text-sm ${view === 'import' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-hover'}`}
        >
          Import CSV
        </button>
      </div>
    </div>
  )
}

export type { FiltersState }
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1 | grep leads-filters
```

Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add components/leads/leads-filters.tsx
git commit -m "feat: extend view type to support 'import' tab in LeadsFilters"
```

---

### Task 5: Intégrer `LeadsImport` dans la page leads

**Files:**
- Modify: `app/(dashboard)/leads/page.tsx`

- [ ] **Step 1: Mettre à jour la page**

Dans `app/(dashboard)/leads/page.tsx` :

1. Changer le type du state `view` :
```tsx
const [view, setView] = useState<'table' | 'kanban' | 'import'>('table')
```

2. Ajouter l'import du composant en haut du fichier :
```tsx
import { LeadsImport } from '@/components/leads/leads-import'
```

3. Dans le JSX, ajouter le 3ème cas dans le rendu conditionnel :
```tsx
{view === 'table' ? (
  <LeadsTable
    leads={filteredLeads}
    onLeadUpdated={(id, updates) => {
      setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l))
    }}
  />
) : view === 'kanban' ? (
  <KanbanBoard leads={filteredLeads} onLeadUpdate={() => {
    createClient().from('leads').select('*').order('score', { ascending: false }).then(({ data }) => {
      if (data) setLeads(data)
    })
  }} />
) : (
  <LeadsImport
    allLeads={leads}
    onLeadsImported={() => {
      createClient().from('leads').select('*').order('score', { ascending: false }).then(({ data }) => {
        if (data) setLeads(data)
      })
    }}
    onSwitchToTable={() => setView('table')}
  />
)}
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npx tsc --noEmit 2>&1
```

Expected: 0 erreur

- [ ] **Step 3: Vérifier le build**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && npm run build 2>&1 | tail -20
```

Expected: build réussi sans erreur

- [ ] **Step 4: Commit final**

```bash
git add app/(dashboard)/leads/page.tsx
git commit -m "feat: integrate CSV import tab into leads page"
```

---

### Task 6: Push et vérification

- [ ] **Step 1: Push sur GitHub**

```bash
cd "/Users/julesgaveglio/Ew X Jul" && git push
```

- [ ] **Step 2: Vérifier manuellement dans le navigateur**

1. Aller sur `/leads`
2. Cliquer sur "Import CSV" dans la barre de vue
3. Vérifier que les filtres sont masqués
4. Uploader un CSV avec des colonnes connues (ex: `nom,telephone,ville`)
5. Vérifier que le mapping est auto-détecté
6. Vérifier la prévisualisation et l'import
7. Télécharger le modèle CSV via le lien
