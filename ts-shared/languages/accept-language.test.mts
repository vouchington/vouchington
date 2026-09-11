import { describe, expect, it } from 'vitest'
import { bestAcceptLanguageMatch } from './accept-language.mts'

describe('bestAcceptLanguageMatch', () => {
  it('returns null for empty/missing input', () => {
    expect(bestAcceptLanguageMatch(null)).toBeNull()
    expect(bestAcceptLanguageMatch(undefined)).toBeNull()
    expect(bestAcceptLanguageMatch('')).toBeNull()
  })

  it('picks the first supported tag in a single-range header', () => {
    expect(bestAcceptLanguageMatch('en')).toBe('en')
  })

  it('falls back from a regional tag to its supported base locale', () => {
    expect(bestAcceptLanguageMatch('en-US')).toBe('en')
  })

  it('orders ranges by explicit q-value, highest first', () => {
    expect(bestAcceptLanguageMatch('es;q=0.9, en;q=0.5')).toBe('es')
  })

  it('treats a missing q-value as q=1 (implicit highest priority)', () => {
    expect(bestAcceptLanguageMatch('fr;q=0.9, en')).toBe('en')
  })

  it('breaks q-value ties by header order', () => {
    expect(bestAcceptLanguageMatch('es;q=0.8, fr;q=0.8')).toBe('es')
  })

  it('skips a q=0 range entirely, even when nothing else matches', () => {
    expect(bestAcceptLanguageMatch('en;q=0')).toBeNull()
  })

  it('returns null when no range matches a supported UI locale', () => {
    expect(bestAcceptLanguageMatch('de, it, ja')).toBeNull()
  })

  it('ignores malformed ranges and quality values', () => {
    expect(bestAcceptLanguageMatch('es;q=2, fr;q=bogus, en;q=0.5')).toBe('en')
  })

  it('honors wildcard and explicit exclusions', () => {
    expect(bestAcceptLanguageMatch('*;q=0.5, en;q=0')).toBe('es')
  })
})
