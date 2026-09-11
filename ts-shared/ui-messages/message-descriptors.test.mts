import { describe, expect, it } from 'vitest'
import { createTranslator, type Catalog } from './index.mts'
import { isMessageDescriptor, PLURAL_RULE_METADATA } from './message-descriptors.mts'
import enMessages from './messages/en.ts'
import esMessages from './messages/es.ts'
import frMessages from './messages/fr.ts'
import ptMessages from './messages/pt.ts'

const CATALOGS_BY_LOCALE = { en: enMessages, es: esMessages, fr: frMessages, pt: ptMessages }

const EXPECTED = {
  en: ['1 language', '2 languages', '1 day ago', '2 days ago', '1 member', '2 members'],
  es: ['1 idioma', '2 idiomas', 'hace 1 día', 'hace 2 días', '1 miembro', '2 miembros'],
  fr: ['1 langue', '2 langues', 'il y a 1 jour', 'il y a 2 jours', '1 membre', '2 membres'],
  pt: ['1 idioma', '2 idiomas', 'há 1 dia', 'há 2 dias', '1 membro', '2 membros'],
} as const

function catalogHasFunction(value: Catalog): boolean {
  return Object.values(value).some(leaf => {
    if (typeof leaf === 'function') return true
    if (typeof leaf === 'string' || isMessageDescriptor(leaf)) return false
    return catalogHasFunction(leaf)
  })
}

describe.each(Object.entries(CATALOGS_BY_LOCALE))('message descriptors (%s)', (locale, catalog) => {
  const t = createTranslator(locale, catalog)
  const expected = EXPECTED[locale as keyof typeof EXPECTED]

  it('resolves plural and select-plural messages', () => {
    expect(t('settings.language.supportedCount', { count: 1 })).toBe(expected[0])
    expect(t('settings.language.supportedCount', { count: 2 })).toBe(expected[1])
    expect(t('shared.timeAgo.relativeDuration', { value: 1, unit: 'day' })).toBe(expected[2])
    expect(t('shared.timeAgo.relativeDuration', { value: 2, unit: 'day' })).toBe(expected[3])
    expect(t('shared.countLabel.format', { count: 1, unit: 'member' })).toBe(expected[4])
    expect(t('shared.countLabel.format', { count: 2, unit: 'member' })).toBe(expected[5])
  })
})

describe('serializable message descriptors', () => {
  it('contains no executable catalog leaves', () => {
    for (const catalog of Object.values(CATALOGS_BY_LOCALE)) {
      expect(catalogHasFunction(catalog)).toBe(false)
      expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog)
    }
  })

  it('declares explicit plural-rule metadata for every catalog locale', () => {
    expect(PLURAL_RULE_METADATA).toEqual({
      en: { algorithm: 'cardinal-one-versus-other' },
      es: { algorithm: 'cardinal-one-versus-other' },
      fr: { algorithm: 'cardinal-one-versus-other' },
      pt: { algorithm: 'cardinal-one-versus-other' },
    })
  })
})
