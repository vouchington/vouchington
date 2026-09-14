import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => importOriginal())
import { DEFAULT_LOCALIZATION_BOUNDS, etagMatches } from '@vouchington/localization'
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
    expect(payload.etag).toBe(`"${payload.revision}"`)
    expect(etagMatches(payload.etag, payload.revision)).toBe(true)
    expect(etagMatches(undefined, payload.revision)).toBe(false)
    expect(() =>
      localizationBatchPayload({
        consumer: 'email',
        locales: ['en-US'],
        selectors: ['email.welcome.preview'],
      }),
    ).toThrow(/not public/)
    expect(isLocalizationClientError(new TypeError('bad'))).toBe(true)
    expect(isLocalizationClientError(new Error('nope'))).toBe(false)
    let overLimitError: unknown
    try {
      localizationBatchPayload({
        consumer: 'web',
        locales: ['en'],
        selectors: Array.from(
          { length: DEFAULT_LOCALIZATION_BOUNDS.maxSelectors + 1 },
          () => 'nav.*',
        ),
      })
    } catch (error) {
      overLimitError = error
    }
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
    setLocalizationDatabaseForTests(undefined)
    process.env.LOCALIZATION_SQLITE_PATH = path
    expect(getLocalizationDatabase().revision).toBe(payload.revision)
    setLocalizationDatabaseForTests(undefined)
    delete process.env.LOCALIZATION_SQLITE_PATH
    expect(() => getLocalizationDatabase()).toThrow(/unable to open|ENOENT|no such file/i)
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

  it('uses package default public bounds', () => {
    expect(DEFAULT_LOCALIZATION_BOUNDS.maxMessages).toBe(2000)
    expect(DEFAULT_LOCALIZATION_BOUNDS.maxSelectors).toBe(32)
  })
})
