import { describe, expect, it } from 'vitest'
import { getValidUrlHref, isHttpUrlWithoutFragment, isValidUrl } from './valid-url'

describe('isValidUrl', () => {
  it('accepts absolute URLs', () => {
    expect(isValidUrl('https://example.com/referral?ref=abc')).toBe(true)
  })

  it('returns the normalized href for absolute URLs', () => {
    expect(getValidUrlHref('https://example.com/referral?ref=abc')).toBe(
      'https://example.com/referral?ref=abc',
    )
  })

  it('rejects relative and malformed URLs', () => {
    expect(isValidUrl('/relative/path')).toBe(false)
    expect(isValidUrl('not a url')).toBe(false)
    expect(getValidUrlHref('not a url')).toBeNull()
  })

  it('does not rely on URL.canParse', () => {
    const descriptor = Object.getOwnPropertyDescriptor(URL, 'canParse')

    Object.defineProperty(URL, 'canParse', {
      configurable: true,
      value: undefined,
    })

    try {
      expect(isValidUrl('https://example.com/referral')).toBe(true)
      expect(getValidUrlHref('https://example.com/referral')).toBe('https://example.com/referral')
      expect(isValidUrl('not a url')).toBe(false)
    } finally {
      if (descriptor) {
        Object.defineProperty(URL, 'canParse', descriptor)
      } else {
        delete (URL as Partial<typeof URL>).canParse
      }
    }
  })
})

describe('isHttpUrlWithoutFragment', () => {
  it('accepts http and https URLs with a host and no fragment', () => {
    expect(isHttpUrlWithoutFragment('https://example.com/path')).toBe(true)
    expect(isHttpUrlWithoutFragment('http://example.com')).toBe(true)
    expect(isHttpUrlWithoutFragment('  https://example.com/path  ')).toBe(true)
  })

  it('rejects URLs with a fragment', () => {
    expect(isHttpUrlWithoutFragment('https://example.com/#section')).toBe(false)
  })

  it('rejects non-http(s) protocols', () => {
    expect(isHttpUrlWithoutFragment('javascript:alert(1)')).toBe(false)
    expect(isHttpUrlWithoutFragment('mailto:a@b.com')).toBe(false)
  })

  it('rejects malformed or empty input', () => {
    expect(isHttpUrlWithoutFragment('not a url')).toBe(false)
    expect(isHttpUrlWithoutFragment('')).toBe(false)
    expect(isHttpUrlWithoutFragment('/relative')).toBe(false)
  })
})
