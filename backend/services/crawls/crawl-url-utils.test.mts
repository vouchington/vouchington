import { describe, it, expect } from 'vitest'
import {
  isSnapshotReusable,
  safeResolveUrl,
  safeHostname,
  parseXRobotsTag,
} from './crawl-url-utils.mts'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from './constants.mts'

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

describe('isSnapshotReusable', () => {
  const retentionMs = CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const anchors = [new Date('2024-02-29T23:59:59.999Z'), new Date('2025-01-01T00:00:00.001Z')]

  it.each(anchors)('keeps the inclusive seven-day cutoff at %s', now => {
    const cutoff = now.getTime() - retentionMs

    expect(isSnapshotReusable(Buffer.alloc(32), new Date(cutoff - 1), now)).toBe(false)
    expect(isSnapshotReusable(Buffer.alloc(32), new Date(cutoff), now)).toBe(true)
    expect(isSnapshotReusable(Buffer.alloc(32), new Date(cutoff + 1), now)).toBe(true)
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
