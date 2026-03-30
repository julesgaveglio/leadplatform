# Design : Import CSV de leads

**Date :** 2026-03-29
**Scope :** Nouvel onglet "Import CSV" dans la page `/leads`, wizard 2 étapes avec mapping intelligent des colonnes.

---

## Contexte

L'application Ew X Jul permet de scanner des leads via Google Maps / Pages Jaunes. On ajoute la possibilité d'importer des leads manuellement via un fichier CSV, avec détection automatique des colonnes et prévisualisation avant insertion.

---

## Architecture

### Emplacement UI

- 3ème onglet dans `app/(dashboard)/leads/page.tsx` : **Table | Kanban | Import CSV**
- Nouveau composant `components/leads/leads-import.tsx` — contient tout le wizard
- Pas de nouvelle route API : parsing côté client, insert direct via `createClient()` Supabase

### Dépendances

- **PapaParse** (`papaparse` + `@types/papaparse`) — parsing CSV dans le navigateur

---

## Composant `LeadsImport`

### Étape 1 — Upload & Mapping

1. **Zone de drop** : drag & drop ou clic pour sélectionner un fichier `.csv`
2. **Parsing** : PapaParse lit les headers + toutes les lignes côté client
3. **Auto-mapping** : pour chaque header CSV, on cherche une correspondance dans la table de synonymes (insensible à la casse, sans accents) :

| Synonymes CSV | Champ Lead | Validation |
|---|---|---|
| nom, company, société, name, entreprise, raison sociale | `company_name` | Requis |
| telephone, tel, phone, téléphone | `phone` | — |
| ville, city | `city` | — |
| adresse, address | `address` | — |
| site, website, url, site web | `website_url` | — |
| secteur, sector, activite, activité | `sector` | — |
| note, notes, commentaire | `notes` | — |
| pays, country | `country` | Normalisé : "france"/"fr" → `'fr'`, "nz"/"nouvelle-zélande"/"new zealand" → `'nz'`. Valeur invalide → ignorée, défaut `'fr'` |
| gerant, gérant, proprietaire, propriétaire, owner_name | `owner_name` | — |
| score | `score` | Doit être numérique (parseInt). Valeur invalide → 0 |
| assigne, assigné, assigned_to, assigned | `assigned_to` | Normalisé : "jules" → `'jules'`, "ewan" → `'ewan'`. Toute autre valeur → `null` |

4. **Tableau de mapping** : une ligne par colonne CSV, avec un `<select>` des champs disponibles. Badge "Auto-détecté" (vert) ou "À mapper" (orange). Option "Ignorer cette colonne".
5. **Validation** : le bouton "Prévisualiser" est bloqué si `company_name` n'est pas mappé.
6. **Télécharger un modèle** : lien qui génère et télécharge un CSV vide avec les headers standards.

### Étape 2 — Preview & Confirmation

1. Tableau des 10 premières lignes avec les valeurs mappées (colonnes = champs leads retenus)
2. Badge résumé : "X leads à importer · Y doublons ignorés (même nom + ville)"
3. Détection doublons : comparaison contre les leads existants chargés en mémoire (déjà disponibles via le state de la page parent)
4. Bouton "Importer X leads" → chaque lead inséré individuellement via `Promise.allSettled(rows.map(row => supabase.from('leads').insert(row)))`. Permet de capturer les échecs par ligne sans bloquer les autres.
5. Valeurs par défaut injectées à l'insert : `status: 'to_call'`, `score: 0`, `scoring_status: 'partial'`, `demo_status: 'idle'`, `google_reviews_count: 0`, `country: 'fr'` (sauf si mappé), `assigned_to: null` (sauf si mappé)
6. Résultat : toast succès/erreur, reset du wizard, redirect vers onglet Table

---

## Gestion des doublons

Skip silencieux : un lead est considéré doublon si `company_name` (normalisé lowercase + trim) **et** `city` (normalisé lowercase + trim, ou `null` pour les deux) correspondent à un lead existant.

La détection s'effectue contre le tableau **`leads[]` complet non filtré** du parent (le state `leads` de `page.tsx`, pas `filteredLeads`). Ce tableau est passé en prop à `LeadsImport`. Cela garantit qu'un doublon existant hors du filtre actif est bien détecté.

Les doublons sont comptabilisés dans le badge résumé mais jamais insérés.

---

## Gestion des erreurs

- Fichier non-CSV → message d'erreur inline
- CSV vide ou sans headers → message d'erreur inline
- CSV > 500 lignes → message d'erreur inline "Fichier trop volumineux (max 500 leads par import)"
- Valeur `country` invalide → silencieusement remplacée par `'fr'`
- Valeur `score` non numérique → remplacée par `0`
- Valeur `assigned_to` invalide → remplacée par `null`
- Échec d'insert partiel → toast avec nombre de lignes échouées (ex: "48 importés, 2 échoués")

---

## Flux de données

```
CSV file
  → PapaParse (client)
  → headers + rows[]
  → auto-mapping (synonymes)
  → MappingUI (corrections manuelles)
  → preview rows (filtrage doublons vs leads[] du parent)
  → supabase.insert() via Promise.allSettled
  → onLeadsImported() callback → refresh leads[]
```

---

## Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `components/leads/leads-import.tsx` | Créer — wizard complet |
| `app/(dashboard)/leads/page.tsx` | Modifier — étendre `view` type à `'table' | 'kanban' | 'import'`, ajouter onglet Import, passer `leads` non filtré à `LeadsImport` |
| `components/leads/leads-filters.tsx` | Modifier — mettre à jour le type `view` prop pour accepter `'import'` (masquer les filtres sur cet onglet) |
| `package.json` | Modifier — ajouter `papaparse` et `@types/papaparse` |
