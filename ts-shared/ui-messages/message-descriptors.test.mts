import { describe, expect, it } from 'vitest'
import type { Catalog } from './index.mts'
import { isMessageDescriptor, PLURAL_RULE_METADATA } from './message-descriptors.mts'
import { enMessages, esMessages, frMessages, ptMessages } from './locale-catalogs.mts'

const CATALOGS_BY_LOCALE = { en: enMessages, es: esMessages, fr: frMessages, pt: ptMessages }

function catalogHasFunction(value: Catalog): boolean {
  return Object.values(value).some(leaf => {
    if (typeof leaf === 'function') return true
    if (typeof leaf === 'string' || isMessageDescriptor(leaf)) return false
    return catalogHasFunction(leaf)
  })
}

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
