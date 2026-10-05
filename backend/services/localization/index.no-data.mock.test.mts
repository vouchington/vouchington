import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => importOriginal())
import { DEFAULT_LOCALIZATION_BOUNDS, type CatalogMessage } from '@vouchington/localization'
import { headerValue, isLocalizationClientError } from './index.mts'
import {
  createLocalizationDatabaseOwner,
  localizationSqlitePath,
  DEFAULT_LOCALIZATION_SQLITE_PATH,
} from './database.mts'

import { queryValues } from './query.mts'

import { createSampleLocalizationContext } from '@voucha/test-helpers/localization-fixtures'

describe('localization service', () => {
  const contexts: ReturnType<typeof createSampleLocalizationContext>[] = []
  function useSampleCatalog(messages?: readonly CatalogMessage[]) {
    const context = createSampleLocalizationContext(messages)
    contexts.push(context)
    return context
  }
  afterEach(() => {
    for (const context of contexts.splice(0)) context.close()
    vi.unstubAllEnvs()
  })

  it('resolves public batches, headers, and client errors', () => {
    const context = useSampleCatalog()
    const { localizationBatchPayload, localizationGetResult, resolveEmailLocalizationBatch } =
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
    expect(resolveEmailLocalizationBatch(['en-US'], ['email.welcome.preview']).messages).toEqual({
      'email.welcome.preview': 'Welcome to Voucha',
    })
    vi.stubEnv('LOCALIZATION_SQLITE_PATH', context.path)
    const owner = createLocalizationDatabaseOwner()
    try {
      expect(owner.get().revision).toBe(payload.revision)
    } finally {
      owner.close()
    }
  })

  it('resolves a public batch at the message bound and rejects one more message', () => {
    const { maxMessages } = DEFAULT_LOCALIZATION_BOUNDS
    const atBound = useSampleCatalog(boundMessages(maxMessages))
    const body = JSON.parse(
      atBound.resolver.localizationBatchPayload({
        consumer: 'web',
        locales: ['en'],
        selectors: ['bound.*'],
      }).body,
    ) as { messages: Record<string, string> }
    expect(Object.keys(body.messages)).toHaveLength(maxMessages)
    expect(body.messages['bound.0000']).toBe('Message 0')

    const overBound = useSampleCatalog(boundMessages(maxMessages + 1))
    const overLimitError = thrownBy(() =>
      overBound.resolver.localizationBatchPayload({
        consumer: 'web',
        locales: ['en'],
        selectors: ['bound.*'],
      }),
    )
    expect(isLocalizationClientError(overLimitError)).toBe(true)
  })

  it('opens the current environment path lazily and caches one owned SQLite handle', () => {
    const first = useSampleCatalog()
    const second = useSampleCatalog(boundMessages(1))
    vi.stubEnv('LOCALIZATION_SQLITE_PATH', first.path)
    const owner = createLocalizationDatabaseOwner()
    vi.stubEnv('LOCALIZATION_SQLITE_PATH', second.path)
    const database = owner.get()
    try {
      expect(database.revision).toBe(second.database.revision)
      expect(database.revision).not.toBe(first.database.revision)
      vi.stubEnv('LOCALIZATION_SQLITE_PATH', first.path)
      expect(owner.get()).toBe(database)
      expect(database.sqlite.isOpen).toBe(true)
    } finally {
      owner.close()
    }
    expect(database.sqlite.isOpen).toBe(false)
    expect(() => owner.close()).not.toThrow()
  })

  it('disposes real SQLite and its temporary artifact idempotently', () => {
    const context = useSampleCatalog()
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
    expect(localizationSqlitePath()).toBe(DEFAULT_LOCALIZATION_SQLITE_PATH)
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
