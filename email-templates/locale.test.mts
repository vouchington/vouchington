import { describe, expect, it } from 'vitest'
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'

describe('resolveUiLocale', () => {
  it.each([
    ['pt-BR', 'pt'],
    ['fr_CA', 'fr'],
    ['es-MX', 'es'],
    ['de-DE', 'en'],
    [null, 'en'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(resolveUiLocale(input)).toBe(expected)
  })
})

describe('getLocalizedSignoff', () => {
  it('returns the localized team signoff', () => {
    expect(getLocalizedSignoff('fr')).toBe("- L'équipe Voucha")
  })
})
