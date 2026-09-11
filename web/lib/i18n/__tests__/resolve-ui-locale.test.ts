import { describe, expect, it } from 'vitest'
import { resolveUiLocale } from '@/lib/i18n/resolve-ui-locale'

describe('resolveUiLocale', () => {
  it('returns the supported user UI locale first', () => {
    expect(
      resolveUiLocale({
        preferredUiLocale: 'en',
        sessionUiLocale: null,
        acceptLanguage: 'fr',
      }),
    ).toBe('en')
  })

  it('falls back from a regional tag to a supported base UI locale', () => {
    expect(
      resolveUiLocale({
        preferredUiLocale: null,
        sessionUiLocale: 'en-US',
        acceptLanguage: null,
      }),
    ).toBe('en')
  })

  it('uses Accept-Language only when it matches a supported UI locale', () => {
    expect(
      resolveUiLocale({
        preferredUiLocale: null,
        sessionUiLocale: null,
        acceptLanguage: 'de, en-US;q=0.9',
      }),
    ).toBe('en')
  })

  it('falls back to English when no supported UI locale exists', () => {
    expect(
      resolveUiLocale({
        preferredUiLocale: 'de',
        sessionUiLocale: 'ja',
        acceptLanguage: 'zh',
      }),
    ).toBe('en')
  })
})
