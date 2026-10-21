import { describe, expect, it } from 'vitest'
import { bestAcceptLanguageMatch } from './accept-language.mts'

describe('bestAcceptLanguageMatch', () => {
  it('falls back from a regional tag to its supported base locale', () => {
    expect(bestAcceptLanguageMatch('en-US')).toBe('en')
  })

  it('binds matching to the supported UI locales, ignoring unsupported ranges', () => {
    expect(bestAcceptLanguageMatch('de, it, ja')).toBeNull()
    expect(bestAcceptLanguageMatch('*;q=0.5, en;q=0')).toBe('es')
  })
})
