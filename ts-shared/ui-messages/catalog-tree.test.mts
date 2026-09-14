import { describe, expect, it } from 'vitest'
import {
  catalogTreeFromLeaves,
  catalogTreeFromMessages,
  lookupCatalogLeaf,
} from './catalog-tree.mts'

describe('catalogTreeFromMessages', () => {
  it('unflattens web messages and skips other consumers', () => {
    const tree = catalogTreeFromMessages(
      [
        {
          id: 'nav.home',
          descriptor: null,
          consumers: ['web'],
          translations: { 'en-US': 'Home', es: 'Inicio' },
        },
        {
          id: 'native.auth.signIn',
          descriptor: null,
          consumers: ['swift'],
          translations: { 'en-US': 'Sign in' },
        },
      ],
      'es',
      ['web'],
    )
    expect(tree).toEqual({ nav: { home: 'Inicio' } })
  })

  it('falls back to en-US for an unrecognized locale', () => {
    const tree = catalogTreeFromMessages(
      [
        {
          id: 'nav.home',
          descriptor: null,
          consumers: ['web'],
          translations: { 'en-US': 'Home', es: 'Inicio' },
        },
      ],
      'de',
      ['web'],
    )
    expect(tree).toEqual({ nav: { home: 'Home' } })
  })

  it('rebuilds plural descriptors from stored forms', () => {
    const tree = catalogTreeFromMessages(
      [
        {
          id: 'settings.language.supportedCount',
          descriptor: { kind: 'plural', valueParameter: 'count', numberParameters: ['count'] },
          consumers: ['web'],
          translations: { 'en-US': { one: '{count} language', other: '{count} languages' } },
        },
      ],
      'en',
      ['web'],
    )
    expect(tree).toEqual({
      settings: {
        language: {
          supportedCount: {
            kind: 'plural',
            valueParameter: 'count',
            numberParameters: ['count'],
            forms: { one: '{count} language', other: '{count} languages' },
          },
        },
      },
    })
  })

  it('rebuilds the same nest from API leaves', () => {
    expect(
      catalogTreeFromLeaves({
        'nav.home': 'Home',
        'settings.language.supportedCount': {
          kind: 'plural',
          valueParameter: 'count',
          forms: { one: '{count} language', other: '{count} languages' },
        },
      }),
    ).toEqual({
      nav: { home: 'Home' },
      settings: {
        language: {
          supportedCount: {
            kind: 'plural',
            valueParameter: 'count',
            forms: { one: '{count} language', other: '{count} languages' },
          },
        },
      },
    })
  })
})

describe('lookupCatalogLeaf', () => {
  const catalog = catalogTreeFromLeaves({
    'nav.home': 'Home',
    'settings.language.supportedCount': {
      kind: 'plural',
      valueParameter: 'count',
      forms: { one: '{count} language', other: '{count} languages' },
    },
  })

  it('returns a string leaf', () => {
    expect(lookupCatalogLeaf(catalog, 'nav.home')).toBe('Home')
  })

  it('returns a descriptor leaf', () => {
    expect(lookupCatalogLeaf(catalog, 'settings.language.supportedCount')).toEqual({
      kind: 'plural',
      valueParameter: 'count',
      forms: { one: '{count} language', other: '{count} languages' },
    })
  })

  it('returns undefined for a missing path', () => {
    expect(lookupCatalogLeaf(catalog, 'nav.doesNotExist')).toBeUndefined()
  })

  it('returns undefined for a non-leaf namespace', () => {
    expect(lookupCatalogLeaf(catalog, 'nav')).toBeUndefined()
    expect(lookupCatalogLeaf(catalog, 'settings.language')).toBeUndefined()
  })
})
