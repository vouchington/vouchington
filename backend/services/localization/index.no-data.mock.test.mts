import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => importOriginal())
import { DEFAULT_LOCALIZATION_BOUNDS, type CatalogMessage } from '@vouchington/localization'
import {
  getLocalizationDatabase,
  headerValue,
  isLocalizationClientError,
  localizationBatchPayload,
  localizationGetResult,
  localizationSqlitePath,
  queryValues,
  resolveEmailLocalizationBatch,
  setLocalizationDatabaseForTests,
} from './index.mts'
import { DEFAULT_LOCALIZATION_SQLITE_PATH } from './database.mts'
import { installSampleLocalizationDatabase } from './test-helpers.mts'

describe('localization service', () => {
  afterEach(() => {
    setLocalizationDatabaseForTests(undefined)
    delete process.env.LOCALIZATION_SQLITE_PATH
  })

  it('resolves public batches, headers, and client errors', () => {
    const path = installSampleLocalizationDatabase()
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
    installSampleLocalizationDatabase(boundMessages(1))
    setLocalizationDatabaseForTests(undefined)
    process.env.LOCALIZATION_SQLITE_PATH = path
    expect(getLocalizationDatabase().revision).toBe(payload.revision)
  })

  it('resolves a public batch at the message bound and rejects one more message', () => {
    const { maxMessages } = DEFAULT_LOCALIZATION_BOUNDS
    installSampleLocalizationDatabase(boundMessages(maxMessages))
    const body = JSON.parse(
      localizationBatchPayload({ consumer: 'web', locales: ['en'], selectors: ['bound.*'] }).body,
    ) as { messages: Record<string, string> }
    expect(Object.keys(body.messages)).toHaveLength(maxMessages)
    expect(body.messages['bound.0000']).toBe('Message 0')

    installSampleLocalizationDatabase(boundMessages(maxMessages + 1))
    const overLimitError = thrownBy(() =>
      localizationBatchPayload({ consumer: 'web', locales: ['en'], selectors: ['bound.*'] }),
    )
    expect(isLocalizationClientError(overLimitError)).toBe(true)
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
  } catch (error) {
    return error
  }
  throw new Error('expected the action to throw')
}
