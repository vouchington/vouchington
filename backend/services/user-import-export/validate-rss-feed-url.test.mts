import { rssFeedUrlValidationCases } from '@voucha/test-helpers/rss-feed-url-validation-cases'
import { describe, expect, it } from 'vitest'
import { validateRssFeedUrl } from './validate-rss-feed-url.mts'

describe('validateRssFeedUrl', () => {
  it('accepts valid HTTPS URL without query params', () => {
    const result = validateRssFeedUrl('https://example.com/feed.xml')
    expect(result).toEqual({ valid: true, canonicalUrl: 'https://example.com/feed.xml' })
  })

  it('rejects empty string', () => {
    const result = validateRssFeedUrl('')
    expect(result).toEqual({ valid: false, error: 'URL is empty' })
  })

  it('rejects whitespace-only string', () => {
    const result = validateRssFeedUrl('   ')
    expect(result).toEqual({ valid: false, error: 'URL is empty' })
  })

  it('rejects invalid URL format', () => {
    const result = validateRssFeedUrl('not-a-url')
    expect(result).toEqual({ valid: false, error: 'Invalid URL format' })
  })

  it('preserves HTTP URL protocol (upgrade deferred to source-creation flow)', () => {
    const result = validateRssFeedUrl('http://example.com/feed.xml')
    expect(result).toEqual({ valid: true, canonicalUrl: 'http://example.com/feed.xml' })
  })

  it('strips default port 80 from HTTP URL', () => {
    const result = validateRssFeedUrl('http://example.com:80/feed.xml')
    expect(result).toEqual({ valid: true, canonicalUrl: 'http://example.com/feed.xml' })
  })

  it('rejects non-http(s) scheme', () => {
    const result = validateRssFeedUrl('ftp://example.com/feed.xml')
    expect(result).toEqual({ valid: false, error: 'Invalid URL format' })
  })

  it('rejects localhost feed URLs', () => {
    const result = validateRssFeedUrl('https://localhost/feed.xml')
    expect(result).toEqual({ valid: false, error: 'Invalid URL format' })
  })

  it('rejects single-label feed URL hostnames', () => {
    const result = validateRssFeedUrl('https://intranet/feed.xml')
    expect(result).toEqual({ valid: false, error: 'Invalid URL format' })
  })

  it.each(rssFeedUrlValidationCases)(
    'validates query-param parity case: $name',
    ({ url, importValidatorResult }) => {
      expect(validateRssFeedUrl(url)).toEqual(importValidatorResult)
    },
  )

  it('trims whitespace before validation', () => {
    const result = validateRssFeedUrl('  https://example.com/feed.xml  ')
    expect(result).toEqual({ valid: true, canonicalUrl: 'https://example.com/feed.xml' })
  })

  it('accepts URL with path segments', () => {
    const result = validateRssFeedUrl('https://blog.example.com/posts/feed.xml')
    expect(result).toEqual({
      valid: true,
      canonicalUrl: 'https://blog.example.com/posts/feed.xml',
    })
  })

  it('rejects URL with fragment', () => {
    const result = validateRssFeedUrl('https://example.com/feed.xml#section')
    expect(result).toEqual({ valid: false, error: 'RSS feed URLs must not contain fragments' })
  })

  it('rejects URL with empty fragment marker', () => {
    const result = validateRssFeedUrl('https://example.com/feed.xml#')
    expect(result).toEqual({ valid: false, error: 'RSS feed URLs must not contain fragments' })
  })
})
