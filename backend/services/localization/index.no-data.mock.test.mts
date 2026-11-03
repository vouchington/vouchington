import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => importOriginal())
import { DEFAULT_LOCALIZATION_BOUNDS, type CatalogMessage } from '@vouchington/localization'
import { headerValue } from './index.mts'
import { localizationSqlitePath } from './database.mts'

import { queryValues } from './query.mts'

import { createSampleLocalizationContext } from '@voucha/test-helpers/localization-fixtures'

describe('localization service', () => {
  const contexts: Awaited<ReturnType<typeof createSampleLocalizationContext>>[] = []
  async function useSampleCatalog(messages?: readonly CatalogMessage[]) {
    const context = await createSampleLocalizationContext(messages)
    contexts.push(context)
    return context
  }
  afterEach(() => {
    for (const context of contexts.splice(0)) context.close()
    vi.unstubAllEnvs()
  })

  it('resolves public batches, headers, and client errors', async () => {
    const context = await useSampleCatalog()
    const { localizationBatchPayload, localizationGetResult, isLocalizationClientError } =
      context.resolver
    const payload = localizationBatchPayload({
      consumer: 'web',
      locales: ['en', 'es'],
      selectors: ['nav.*'],
    })
    expect(JSON.parse(payload.body).messages['nav.home']).toBe('Home')
    const emailError = thrownBy(() =>
      localizationBatchPayload({
        consumer: 'email',
        locales: ['en-US'],
        selectors: ['email.welcome.preview'],
      }),
    )
    expect(isLocalizationClientError(emailError)).toBe(true)
    expect(isLocalizationClientError(new TypeError('bad'))).toBe(true)
    expect(isLocalizationClientError(new Error('nope'))).toBe(false)
    const overLimitError = thrownBy(() =>
      localizationBatchPayload({
        consumer: 'web',
        locales: ['en'],
        selectors: Array.from(
          { length: DEFAULT_LOCALIZATION_BOUNDS.maxSelectors + 1 },
          () => 'nav.*',
        ),
      }),
    )
    expect(isLocalizationClientError(overLimitError)).toBe(true)
    expect(
      localizationBatchPayload({
        consumer: 'web',
        locales: ['en'],
        selectors: Array.from({ length: DEFAULT_LOCALIZATION_BOUNDS.maxSelectors }, () => 'nav.*'),
      }).body,
    ).toContain('nav.home')
    const fresh = localizationGetResult(
      { consumer: 'web', locales: 'en', selectors: 'nav.*' },
      undefined,
    )
    expect(fresh.status).toBe(200)
    expect(JSON.parse(fresh.body ?? '{}').messages['nav.home']).toBe('Home')
    expect(
      localizationGetResult({ consumer: 'web', locales: 'en', selectors: 'nav.*' }, fresh.etag)
        .status,
    ).toBe(304)
    expect(() => localizationGetResult({}, undefined)).toThrow(/consumer is required/)
    expect(context.getLocalizationDatabase().revision).toBe(payload.revision)
  })

  it('caches one owned SQLite handle per module instance', async () => {
    const first = await useSampleCatalog()
    const second = await useSampleCatalog(boundMessages(1))
    expect(second.database.revision).not.toBe(first.database.revision)
    vi.stubEnv('LOCALIZATION_SQLITE_PATH', first.path)
    expect(second.getLocalizationDatabase()).toBe(second.database)
    expect(second.database.sqlite.isOpen).toBe(true)
  })

  it('disposes real SQLite and its temporary artifact idempotently', async () => {
    const context = await useSampleCatalog()
    expect(context.database.sqlite.isOpen).toBe(true)
    expect(existsSync(context.path)).toBe(true)

    context.close()

    expect(context.database.sqlite.isOpen).toBe(false)
    expect(existsSync(context.path)).toBe(false)
    expect(() => context.close()).not.toThrow()
  })

  it('parses query lists and header values', () => {
    expect(queryValues(undefined)).toEqual([])
    expect(queryValues('nav.*')).toEqual(['nav.*'])
    expect(queryValues(['nav.*,headers.*', 'common.cancel'])).toEqual([
      'nav.*',
      'headers.*',
      'common.cancel',
    ])
    expect(headerValue(undefined)).toBeUndefined()
    expect(headerValue('etag')).toBe('etag')
    expect(headerValue(['a', 'b'])).toBe('a,b')
    vi.stubEnv('LOCALIZATION_SQLITE_PATH', undefined)
    expect(localizationSqlitePath()).toBe('/app/localization/catalog.sqlite')
  })
})

function boundMessages(count: number): CatalogMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `bound.${String(index).padStart(4, '0')}`,
    descriptor: null,
    consumers: ['web'],
    translations: { 'en-US': `Message ${index}` },
  }))
}

function thrownBy(action: () => unknown): unknown {
  try {
    action()
  } catch (err) {
    return err
  }
  throw new Error('expected the action to throw')
}
