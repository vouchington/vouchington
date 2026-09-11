import { describe, expect, it } from 'vitest'
import { OUTBOUND_UTM, SHARE_UTM, appendUtm, isExternalHref } from './utm'

describe('isExternalHref', () => {
  it('returns true for absolute URLs on a different host', () => {
    expect(isExternalHref('https://example.com/path')).toBe(true)
    expect(isExternalHref('http://example.com/')).toBe(true)
  })

  it('returns false for absolute URLs on voucha.ai', () => {
    expect(isExternalHref('https://voucha.ai/abc')).toBe(false)
    expect(isExternalHref('https://voucha.ai/@user?x=1')).toBe(false)
  })

  it('returns false for relative paths and hashes', () => {
    expect(isExternalHref('/relative')).toBe(false)
    expect(isExternalHref('#anchor')).toBe(false)
    expect(isExternalHref('')).toBe(false)
  })

  it('returns false for non-http(s) schemes', () => {
    expect(isExternalHref('mailto:tests+hi@voucha.ai')).toBe(false)
    expect(isExternalHref('tel:+15555555555')).toBe(false)
    expect(isExternalHref('ftp://example.com/file')).toBe(false)
  })

  it('returns true for scheme-relative external hrefs', () => {
    expect(isExternalHref('//example.com/path')).toBe(true)
  })

  it('returns false for scheme-relative same-origin hrefs', () => {
    expect(isExternalHref('//voucha.ai/path')).toBe(false)
  })

  it('returns false for malformed URLs', () => {
    expect(isExternalHref('not a url')).toBe(false)
  })
})

describe('appendUtm', () => {
  it('appends utm_source and utm_medium to a clean URL', () => {
    expect(appendUtm('https://example.com/path', OUTBOUND_UTM)).toBe(
      'https://example.com/path?utm_source=voucha.ai&utm_medium=referral',
    )
  })

  it('preserves existing query params', () => {
    const out = appendUtm('https://example.com/path?ref=abc&x=1', OUTBOUND_UTM)
    const parsed = new URL(out)
    expect(parsed.searchParams.get('ref')).toBe('abc')
    expect(parsed.searchParams.get('x')).toBe('1')
    expect(parsed.searchParams.get('utm_source')).toBe('voucha.ai')
    expect(parsed.searchParams.get('utm_medium')).toBe('referral')
  })

  it('uses the share params when SHARE_UTM is passed', () => {
    const out = appendUtm('https://voucha.ai/@me', SHARE_UTM)
    const parsed = new URL(out)
    expect(parsed.searchParams.get('utm_source')).toBe('voucha')
    expect(parsed.searchParams.get('utm_medium')).toBe('share')
  })

  it('returns the input unchanged if any utm_* param is already present', () => {
    const url = 'https://example.com/path?utm_source=other&utm_campaign=x'
    expect(appendUtm(url, OUTBOUND_UTM)).toBe(url)
  })

  it('handles scheme-relative URLs by normalising to https', () => {
    expect(appendUtm('//example.com/path', OUTBOUND_UTM)).toBe(
      'https://example.com/path?utm_source=voucha.ai&utm_medium=referral',
    )
  })

  it('returns the input unchanged for invalid URLs', () => {
    expect(appendUtm('not a url', OUTBOUND_UTM)).toBe('not a url')
    expect(appendUtm('', OUTBOUND_UTM)).toBe('')
  })

  it('returns the input unchanged for non-http(s) schemes', () => {
    expect(appendUtm('mailto:tests+hi@voucha.ai', OUTBOUND_UTM)).toBe('mailto:tests+hi@voucha.ai')
    expect(appendUtm('tel:+15555555555', OUTBOUND_UTM)).toBe('tel:+15555555555')
  })

  it('preserves fragments', () => {
    const out = appendUtm('https://example.com/path#section', OUTBOUND_UTM)
    expect(out.endsWith('#section')).toBe(true)
    const parsed = new URL(out)
    expect(parsed.searchParams.get('utm_source')).toBe('voucha.ai')
  })
})
