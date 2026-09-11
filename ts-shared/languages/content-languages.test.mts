import { describe, expect, it } from 'vitest'
import { LINGUA_LANGUAGES } from './codes.mts'
import {
  CONTENT_LANGUAGE_SELECT_OPTIONS,
  getContentLanguageDir,
  getEffectiveContentLanguage,
  normalizeContentLanguageTag,
} from './content-languages.mts'

describe('normalizeContentLanguageTag', () => {
  it('normalizes supported content language tags to ISO 639-1', () => {
    expect(normalizeContentLanguageTag('EN_us')).toBe('en')
    expect(normalizeContentLanguageTag('fr-CA')).toBe('fr')
  })

  it('returns null for unsupported content language tags', () => {
    expect(normalizeContentLanguageTag('zz-US')).toBeNull()
    expect(normalizeContentLanguageTag(null)).toBeNull()
  })
})

describe('content language helpers', () => {
  it('generates language-only select options', () => {
    expect(CONTENT_LANGUAGE_SELECT_OPTIONS).toHaveLength(LINGUA_LANGUAGES.length)
    expect(CONTENT_LANGUAGE_SELECT_OPTIONS).toContainEqual({ value: 'en', label: 'English' })
  })

  it('prefers declared language over detected language', () => {
    expect(getEffectiveContentLanguage({ declaredLanguage: 'fr', detectedLanguage: 'en' })).toBe(
      'fr',
    )
    expect(getEffectiveContentLanguage({ declaredLanguage: null, detectedLanguage: 'en-US' })).toBe(
      'en',
    )
    expect(getEffectiveContentLanguage({ declaredLanguage: 'zz', detectedLanguage: null })).toBe(
      undefined,
    )
  })
})

describe('getContentLanguageDir', () => {
  it('returns rtl for known RTL language codes', () => {
    expect(getContentLanguageDir('ar')).toBe('rtl')
    expect(getContentLanguageDir('he')).toBe('rtl')
    expect(getContentLanguageDir('fa')).toBe('rtl')
    expect(getContentLanguageDir('ur')).toBe('rtl')
  })

  it('returns ltr for LTR language codes', () => {
    expect(getContentLanguageDir('en')).toBe('ltr')
    expect(getContentLanguageDir('fr')).toBe('ltr')
    expect(getContentLanguageDir('ja')).toBe('ltr')
    expect(getContentLanguageDir('zh')).toBe('ltr')
  })

  it('returns auto when lang is null or undefined', () => {
    expect(getContentLanguageDir(null)).toBe('auto')
    expect(getContentLanguageDir(undefined)).toBe('auto')
  })
})
