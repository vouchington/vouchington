import { describe, it, expect } from 'vitest'
import { safeResolveUrl, safeHostname, parseXRobotsTag } from './crawl-url-utils.mts'
import { CrawlerNetworkError, isCrawlerNetworkDnsError } from '@modules/on-error/errors'

describe('parseXRobotsTag', () => {
  it('returns empty string for empty input', () => {
    expect(parseXRobotsTag('')).toBe('')
  })

  it('keeps noindex without agent prefix', () => {
    expect(parseXRobotsTag('noindex')).toBe('noindex')
  })

  it('drops googlebot-specific noindex', () => {
    expect(parseXRobotsTag('googlebot: noindex')).toBe('')
  })

  it('keeps all: noindex', () => {
    expect(parseXRobotsTag('all: noindex')).toBe('all: noindex')
  })

  it('handles multi-directive comma-separated header', () => {
    expect(parseXRobotsTag('noindex, nofollow')).toBe('noindex, nofollow')
  })

  it('drops agent-specific directives but keeps global ones', () => {
    expect(parseXRobotsTag('noindex, googlebot: index')).toBe('noindex')
  })

  it('preserves unavailable_after value directive', () => {
    expect(parseXRobotsTag('unavailable_after: 25 Jun 2010 15:00:00 PST')).toBe(
      'unavailable_after: 25 Jun 2010 15:00:00 PST',
    )
  })

  it('preserves max-snippet value directive', () => {
    expect(parseXRobotsTag('max-snippet: 100')).toBe('max-snippet: 100')
  })

  it('preserves max-image-preview value directive', () => {
    expect(parseXRobotsTag('max-image-preview: large')).toBe('max-image-preview: large')
  })

  it('handles combined meta+xRobotsTag noindex check', () => {
    const meta = 'noindex'
    const xRobotsTag = parseXRobotsTag('googlebot: index')
    const robotsDirectives = `${meta} ${xRobotsTag}`
    expect(/noindex/i.test(robotsDirectives)).toBe(true)
  })

  it('does not trigger noindex from agent-specific header', () => {
    const meta = ''
    const xRobotsTag = parseXRobotsTag('googlebot: noindex')
    const robotsDirectives = `${meta} ${xRobotsTag}`
    expect(/noindex/i.test(robotsDirectives)).toBe(false)
  })

  it('respects voucha-bot-specific noindex (strips agent prefix)', () => {
    expect(parseXRobotsTag('voucha-bot: noindex')).toBe('noindex')
  })

  it('drops other bot directives but keeps voucha-bot directive value', () => {
    expect(parseXRobotsTag('googlebot: index, voucha-bot: noindex')).toBe('noindex')
  })
})

describe('safeResolveUrl', () => {
  it('resolves relative URL against base', () => {
    expect(safeResolveUrl('/page', 'https://example.com/other')).toBe('https://example.com/page')
  })

  it('returns absolute URL unchanged', () => {
    expect(safeResolveUrl('https://other.com/page', 'https://example.com/')).toBe(
      'https://other.com/page',
    )
  })

  it('returns null for null input', () => {
    expect(safeResolveUrl(null, 'https://example.com/')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(safeResolveUrl('', 'https://example.com/')).toBeNull()
  })
})

describe('safeHostname', () => {
  it('extracts hostname from valid URL', () => {
    expect(safeHostname('https://example.com/page')).toBe('example.com')
  })

  it('returns null for invalid URL', () => {
    expect(safeHostname('not-a-url')).toBeNull()
  })
})

describe('isCrawlerNetworkDnsError', () => {
  it('returns true for ENOTFOUND cause', () => {
    const err = new CrawlerNetworkError(
      'https://example.com',
      100,
      new Error('ENOTFOUND example.com'),
    )
    expect(isCrawlerNetworkDnsError(err)).toBe(true)
  })

  it('returns true for getaddrinfo cause', () => {
    const err = new CrawlerNetworkError(
      'https://example.com',
      100,
      new Error('getaddrinfo ENOTFOUND example.com'),
    )
    expect(isCrawlerNetworkDnsError(err)).toBe(true)
  })

  it('returns false for ECONNREFUSED cause', () => {
    const err = new CrawlerNetworkError(
      'https://example.com',
      100,
      new Error('connect ECONNREFUSED 127.0.0.1:443'),
    )
    expect(isCrawlerNetworkDnsError(err)).toBe(false)
  })

  it('returns false for ECONNRESET cause', () => {
    const err = new CrawlerNetworkError('https://example.com', 100, new Error('read ECONNRESET'))
    expect(isCrawlerNetworkDnsError(err)).toBe(false)
  })

  it('returns true for nested cause (TypeError wrapping DNS error — Node.js fetch shape)', () => {
    const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), {
      code: 'ENOTFOUND',
    })
    const fetchError = Object.assign(new TypeError('fetch failed'), { cause: dnsError })
    const err = new CrawlerNetworkError('https://example.com', 100, fetchError)
    expect(isCrawlerNetworkDnsError(err)).toBe(true)
  })

  it('returns false for nested non-DNS cause', () => {
    const connError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
      code: 'ECONNREFUSED',
    })
    const fetchError = Object.assign(new TypeError('fetch failed'), { cause: connError })
    const err = new CrawlerNetworkError('https://example.com', 100, fetchError)
    expect(isCrawlerNetworkDnsError(err)).toBe(false)
  })
})
