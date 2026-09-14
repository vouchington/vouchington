import { describe, expect, it } from 'vitest'
import { deserializeCatalog, serializeCatalog } from './catalog-bootstrap.mts'
import { createTranslator } from './index.mts'
import { catalogMessagesFromTables } from './load-catalog-json.mts'
import { enMessages, esMessages } from './locale-catalogs.mts'

describe('catalog bootstrap', () => {
  it('projects normalized copies, aliases, and locale rows back to consumer aliases', () => {
    expect(
      catalogMessagesFromTables({
        copies: [
          {
            id: 'copy.fixture.count',
            descriptor: { kind: 'plural', valueParameter: 'count' },
          },
        ],
        aliases: [
          { consumer: 'web', alias: 'fixture.count', copyId: 'copy.fixture.count' },
          { consumer: 'swift', alias: 'fixture.count', copyId: 'copy.fixture.count' },
        ],
        translations: {
          'en-US': [
            { id: 'copy.fixture.count', value: { one: '{count} item', other: '{count} items' } },
          ],
          es: [
            {
              id: 'copy.fixture.count',
              value: { one: '{count} elemento', other: '{count} elementos' },
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: 'fixture.count',
        consumers: ['web', 'swift'],
        descriptor: { kind: 'plural', valueParameter: 'count' },
        translations: {
          'en-US': { one: '{count} item', other: '{count} items' },
          es: { one: '{count} elemento', other: '{count} elementos' },
        },
      },
    ])
  })

  it('rejects an alias that maps to different copies for separate consumers', () => {
    expect(() =>
      catalogMessagesFromTables({
        copies: [
          { id: 'copy.fixture.first', descriptor: null },
          { id: 'copy.fixture.second', descriptor: null },
        ],
        aliases: [
          { consumer: 'web', alias: 'fixture.duplicate', copyId: 'copy.fixture.first' },
          { consumer: 'swift', alias: 'fixture.duplicate', copyId: 'copy.fixture.second' },
        ],
        translations: {},
      }),
    ).toThrow('Alias "fixture.duplicate" maps to more than one copy')
  })

  it('serializes every catalog leaf, including plural descriptors', () => {
    const serialized = serializeCatalog(enMessages)

    expect(serialized.nav).toEqual(enMessages.nav)
    expect(serialized).not.toHaveProperty('native')
    expect(
      (serialized.settings as Record<string, Record<string, unknown>>).language.supportedCount,
    ).toMatchObject({ kind: 'plural', valueParameter: 'count' })
  })

  it('keeps native-only catalog modules out of the web catalog import graph', async () => {
    const [{ readFile }, { dirname, join }, { fileURLToPath }] = await Promise.all([
      import('node:fs/promises'),
      import('node:path'),
      import('node:url'),
    ])
    const directory = dirname(fileURLToPath(import.meta.url))
    const webCatalogSources = await Promise.all([
      readFile(join(directory, 'locale-loader.mts'), 'utf8'),
      readFile(join(directory, 'load-catalog-json.mts'), 'utf8'),
    ])

    expect(webCatalogSources.join('\n')).not.toMatch(
      /native-(?:dotnet|swift|shared|route-metadata)/,
    )
  })

  it('produces a detached JSON-safe value without loss', () => {
    const serialized = serializeCatalog(enMessages)
    const roundTripped = JSON.parse(JSON.stringify(serialized))

    expect(roundTripped).toEqual(serialized)
    expect(serialized).not.toBe(enMessages)
  })

  it('accepts a serialized complete catalog without reconstructing executable leaves', () => {
    const roundTripped = JSON.parse(JSON.stringify(serializeCatalog(enMessages)))
    const t = createTranslator('en', deserializeCatalog(roundTripped))

    expect(t('nav.home')).toBe('Home')
    expect(t('settings.language.supportedCount', { count: 2 })).toBe('2 languages')
  })

  it('preserves the requested locale descriptors through the bootstrap', () => {
    const roundTripped = JSON.parse(JSON.stringify(serializeCatalog(esMessages)))
    const t = createTranslator('es', deserializeCatalog(roundTripped))

    expect(t('settings.language.supportedCount', { count: 2 })).toBe('2 idiomas')
  })
})
