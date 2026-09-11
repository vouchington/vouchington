import { describe, expect, it } from 'vitest'
import { toOpenGraphLocale } from './open-graph.mts'

describe('toOpenGraphLocale', () => {
  it('maps supported language tags to explicit OpenGraph locales', () => {
    expect(toOpenGraphLocale('en')).toBe('en_US')
    expect(toOpenGraphLocale('fr-CA')).toBe('fr_CA')
    expect(toOpenGraphLocale('es-US')).toBe('es_US')
    expect(toOpenGraphLocale('ES')).toBe('es_ES')
  })

  it('omits unmapped languages instead of fabricating invalid locales', () => {
    expect(toOpenGraphLocale('zz-US')).toBeUndefined()
    expect(toOpenGraphLocale('yo')).toBeUndefined()
    expect(toOpenGraphLocale('yo-US')).toBeUndefined()
    expect(toOpenGraphLocale('123-US')).toBeUndefined()
    expect(toOpenGraphLocale('')).toBeUndefined()
    expect(toOpenGraphLocale(null)).toBeUndefined()
  })
})
