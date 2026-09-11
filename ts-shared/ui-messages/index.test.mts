import { describe, expect, it } from 'vitest'
import { createTranslator, loadMessages, type MessageKey } from './index.mts'
import enMessages from './messages/en.ts'
import esMessages from './messages/es.ts'
import frMessages from './messages/fr.ts'
import ptMessages from './messages/pt.ts'

describe('createTranslator', () => {
  const t = createTranslator('en', enMessages)

  it('interpolates {param} placeholders in plain strings', () => {
    expect(t('settings.language.currentLabel', { language: 'Español' })).toBe(
      'Current language: Español',
    )
  })

  it('leaves a string unchanged when it has no placeholders', () => {
    expect(t('settings.language.title')).toBe('Language')
  })

  it('resolves the plural key for n=1 via Intl.PluralRules("en")', () => {
    expect(t('settings.language.supportedCount', { count: 1 })).toBe('1 language')
  })

  it('resolves the plural key for n=2 and n=5 via Intl.PluralRules("en")', () => {
    expect(t('settings.language.supportedCount', { count: 2 })).toBe('2 languages')
    expect(t('settings.language.supportedCount', { count: 5 })).toBe('5 languages')
  })

  it('retains Voucha number formatting for catalog number parameters', () => {
    expect(t('shared.countLabel.format', { count: 1_000, unit: 'member' })).toBe('1,000 members')
  })

  it('throws a clear error for an unresolvable path', () => {
    expect(() => t('nav.doesNotExist' as MessageKey)).toThrow(
      /Unresolvable message key "nav.doesNotExist"/,
    )
  })

  it('throws a clear error when a key resolves to a nested object, not a leaf', () => {
    expect(() => t('settings.language' as MessageKey)).toThrow(
      /Message key "settings.language" resolves to a non-leaf value/,
    )
  })

  it('throws a clear error for an unknown select-plural case', () => {
    expect(() => t('shared.timeAgo.relativeDuration', { unit: 'fortnight', value: 2 })).toThrow(
      'Unknown select-plural case "fortnight" for "unit"',
    )
  })
})

describe('loadMessages', () => {
  it('resolves the en catalog for "en"', { timeout: 30_000 }, async () => {
    expect(await loadMessages('en')).toStrictEqual(enMessages)
  })

  it('resolves the es catalog for "es"', { timeout: 30_000 }, async () => {
    expect(await loadMessages('es')).toStrictEqual(esMessages)
  })

  it('resolves the fr catalog for "fr"', { timeout: 30_000 }, async () => {
    expect(await loadMessages('fr')).toStrictEqual(frMessages)
  })

  it('resolves the pt catalog for "pt"', { timeout: 30_000 }, async () => {
    expect(await loadMessages('pt')).toStrictEqual(ptMessages)
  })

  it('falls back to en for an unrecognized locale', { timeout: 30_000 }, async () => {
    expect(await loadMessages('xx')).toStrictEqual(enMessages)
  })

  it(
    'preserves message descriptors after assembling split namespace chunks',
    { timeout: 30_000 },
    async () => {
      const catalog = await loadMessages('en')
      const t = createTranslator('en', catalog)

      expect(t('settings.language.supportedCount', { count: 2 })).toBe('2 languages')
    },
  )
})
