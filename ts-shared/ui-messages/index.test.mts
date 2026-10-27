import { describe, expect, it } from 'vitest'
import { createTranslator, type MessageKey } from './index.mts'
import { loadMessages } from './locale-loader.mts'
import { enMessages, esMessages, frMessages, ptMessages } from './locale-catalogs.mts'

describe('createTranslator', () => {
  const t = createTranslator('en', enMessages)

  it('retains Voucha number formatting for catalog number parameters', () => {
    expect(t('shared.countLabel.format', { count: 1_000, unit: 'member' })).toBe('1,000 members')
  })

  it('degrades missing and non-leaf keys when onUnresolved is set', () => {
    const unresolved: string[] = []
    const degrading = createTranslator('en', enMessages, {
      onUnresolved: key => {
        unresolved.push(key)
        return ''
      },
    })

    expect(degrading('nav.doesNotExist' as MessageKey)).toBe('')
    expect(degrading('settings.language' as MessageKey)).toBe('')
    expect(unresolved).toEqual(['nav.doesNotExist', 'settings.language'])
    expect(degrading('settings.language.title')).toBe('Language')
  })

  it('still throws unknown select-plural cases when onUnresolved is set', () => {
    const degrading = createTranslator('en', enMessages, { onUnresolved: () => '' })
    expect(() =>
      degrading('shared.timeAgo.relativeDuration', { unit: 'fortnight', value: 2 }),
    ).toThrow('Unknown select-plural case "fortnight" for "unit"')
  })
})

describe('loadMessages', () => {
  it('resolves the en catalog for "en"', async () => {
    expect(await loadMessages('en')).toStrictEqual(enMessages)
  })

  it('resolves the es catalog for "es"', async () => {
    expect(await loadMessages('es')).toStrictEqual(esMessages)
  })

  it('resolves the fr catalog for "fr"', async () => {
    expect(await loadMessages('fr')).toStrictEqual(frMessages)
  })

  it('resolves the pt catalog for "pt"', async () => {
    expect(await loadMessages('pt')).toStrictEqual(ptMessages)
  })

  it('falls back to en for an unrecognized locale', async () => {
    expect(await loadMessages('xx')).toStrictEqual(enMessages)
  })

  it('preserves message descriptors after assembling split namespace chunks', async () => {
    const catalog = await loadMessages('en')
    const t = createTranslator('en', catalog)

    expect(t('settings.language.supportedCount', { count: 2 })).toBe('2 languages')
  })
})

describe('web catalog size', () => {
  it('is larger than one public API batch, so clients must select a route subset', async () => {
    const { loadCatalogMessages } = await import('./load-catalog-json.mts')
    const webCount = loadCatalogMessages().filter(message =>
      message.consumers.includes('web'),
    ).length
    expect(webCount).toBeGreaterThan(2000)
  })
})
