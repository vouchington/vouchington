import { describe, expect, it } from 'vitest'
import { deserializeCatalog, serializeCatalog } from './catalog-bootstrap.mts'
import { createTranslator } from './index.mts'
import enMessages from './messages/en.ts'
import esMessages from './messages/es.ts'

describe('catalog bootstrap', () => {
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
      readFile(join(directory, 'messages/en.ts'), 'utf8'),
      readFile(join(directory, 'messages/en/core.ts'), 'utf8'),
      readFile(join(directory, 'locale-loader.mts'), 'utf8'),
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
