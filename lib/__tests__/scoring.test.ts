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
