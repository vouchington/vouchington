import { describe, expect, it } from 'vitest'
import type { SitemapUrl } from './types.mts'
import { buildSitemapIndex, buildUrlset } from './xml-builder.mts'

describe('XML Builder', () => {
  describe('buildSitemapIndex', () => {
    it('should build a valid sitemap index with single entry', () => {
      const sitemaps = [{ loc: 'https://example.com/sitemaps/discussion.xml' }]
      const result = buildSitemapIndex(sitemaps)

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(result).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
      expect(result).toContain('<sitemap>')
      expect(result).toContain('<loc>https://example.com/sitemaps/discussion.xml</loc>')
      expect(result).toContain('</sitemap>')
      expect(result).toContain('</sitemapindex>')
    })

    it('should build a valid sitemap index with multiple entries', () => {
      const sitemaps = [
        { loc: 'https://example.com/sitemaps/discussion.xml' },
        { loc: 'https://example.com/sitemaps/review.xml' },
      ]
      const result = buildSitemapIndex(sitemaps)

      expect(result).toContain('https://example.com/sitemaps/discussion.xml')
      expect(result).toContain('https://example.com/sitemaps/review.xml')
    })

    it('should build an empty sitemap index when no entries provided', () => {
      const sitemaps: Array<{ loc: string }> = []
      const result = buildSitemapIndex(sitemaps)

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(result).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
      expect(result).toContain('</sitemapindex>')
    })

    it('should escape XML special characters in URLs', () => {
      const sitemaps = [{ loc: 'https://example.com/sitemaps?foo=bar&baz=qux' }]
      const result = buildSitemapIndex(sitemaps)

      expect(result).toContain('https://example.com/sitemaps?foo=bar&amp;baz=qux')
      expect(result).not.toContain('&baz=')
    })

    it('should escape XML special characters including quotes and apostrophes', () => {
      const sitemaps = [{ loc: 'https://example.com/test?q="hello\'world"' }]
      const result = buildSitemapIndex(sitemaps)

      expect(result).toContain('&quot;hello&#39;world&quot;')
    })
  })

  describe('buildUrlset', () => {
    it('should build a valid urlset with single entry', () => {
      const urls: SitemapUrl[] = [
        {
          loc: 'https://example.com/discussion/test-slug',
          lastmod: '2026-01-25T12:00:00.000Z',
        },
      ]
      const result = buildUrlset(urls)

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(result).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
      expect(result).toContain('<url>')
      expect(result).toContain('<loc>https://example.com/discussion/test-slug</loc>')
      expect(result).toContain('<lastmod>2026-01-25T12:00:00.000Z</lastmod>')
      expect(result).toContain('</url>')
      expect(result).toContain('</urlset>')
    })

    it('should build a valid urlset with multiple entries', () => {
      const urls: SitemapUrl[] = [
        {
          loc: 'https://example.com/discussion/first',
          lastmod: '2026-01-25T12:00:00.000Z',
        },
        {
          loc: 'https://example.com/review/second',
          lastmod: '2026-01-26T12:00:00.000Z',
        },
      ]
      const result = buildUrlset(urls)

      expect(result).toContain('https://example.com/discussion/first')
      expect(result).toContain('2026-01-25T12:00:00.000Z')
      expect(result).toContain('https://example.com/review/second')
      expect(result).toContain('2026-01-26T12:00:00.000Z')
    })

    it('should build an empty urlset when no entries provided', () => {
      const urls: SitemapUrl[] = []
      const result = buildUrlset(urls)

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(result).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
      expect(result).toContain('</urlset>')
    })

    it('should escape XML special characters in URLs', () => {
      const urls: SitemapUrl[] = [
        {
          loc: 'https://example.com/test?foo=bar&baz=qux',
          lastmod: '2026-01-25T12:00:00.000Z',
        },
      ]
      const result = buildUrlset(urls)

      expect(result).toContain('https://example.com/test?foo=bar&amp;baz=qux')
      expect(result).not.toContain('&baz=')
    })
  })
})
