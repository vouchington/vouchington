import { describe, expect, it } from 'vitest'
import { omitAtDefaultLocale, resolveEdgeUiLocale } from './edge-ui-locale.mts'

const requestWithAcceptLanguage = (acceptLanguage: string | null): Request =>
  new Request('https://voucha.ai/', {
    headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {},
  })

describe('resolveEdgeUiLocale', () => {
  it('falls back to DEFAULT_UI_LOCALE with no session payload and no Accept-Language', () => {
    expect(resolveEdgeUiLocale(requestWithAcceptLanguage(null), null)).toBe('en')
  })

  it('uses Accept-Language when there is no session payload', () => {
    expect(resolveEdgeUiLocale(requestWithAcceptLanguage('en-US'), null)).toBe('en')
  })

  it('falls back to DEFAULT_UI_LOCALE when Accept-Language matches no supported locale', () => {
    expect(resolveEdgeUiLocale(requestWithAcceptLanguage('de, it'), null)).toBe('en')
  })

  it('prefers a supported session uil claim over Accept-Language', () => {
    expect(resolveEdgeUiLocale(requestWithAcceptLanguage('fr'), { uid: 'user-1', uil: 'en' })).toBe(
      'en',
    )
  })

  it('falls through to Accept-Language when the session uil claim is unsupported', () => {
    expect(resolveEdgeUiLocale(requestWithAcceptLanguage('en'), { uid: 'user-1', uil: 'de' })).toBe(
      'en',
    )
  })
})

describe('omitAtDefaultLocale', () => {
  it('omits the default UI locale', () => {
    expect(omitAtDefaultLocale('en')).toBeUndefined()
  })

  it('includes a non-default UI locale', () => {
    expect(omitAtDefaultLocale('fr')).toBe('fr')
  })
})
