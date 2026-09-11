import { describe, expect, it } from 'vitest'
import { getCanonicalSitemapUrl } from './routing.mts'

describe('getCanonicalSitemapUrl', () => {
  it('returns null for non-sitemap URLs', () => {
    expect(getCanonicalSitemapUrl(new URL('https://voucha.ai/about'))).toBeNull()
    expect(getCanonicalSitemapUrl(new URL('https://voucha.ai/api/v1/posts'))).toBeNull()
    expect(getCanonicalSitemapUrl(new URL('https://voucha.ai/'))).toBeNull()
  })

  it('returns null for sitemap URLs without a query string', () => {
    expect(getCanonicalSitemapUrl(new URL('https://voucha.ai/sitemap.xml'))).toBeNull()
    expect(getCanonicalSitemapUrl(new URL('https://voucha.ai/sitemaps/discussion.xml'))).toBeNull()
  })

  it('returns canonical URL (stripped query) for sitemap URLs with query string', () => {
    const result = getCanonicalSitemapUrl(new URL('https://voucha.ai/sitemap.xml?x=1&y=2'))
    expect(result).not.toBeNull()
    expect(result?.toString()).toBe('https://voucha.ai/sitemap.xml')

    const result2 = getCanonicalSitemapUrl(
      new URL('https://voucha.ai/sitemaps/discussion.xml?cache-bust=abc'),
    )
    expect(result2).not.toBeNull()
    expect(result2?.toString()).toBe('https://voucha.ai/sitemaps/discussion.xml')
  })

  it('returns canonical URL preserving the path when query string is present', () => {
    const result = getCanonicalSitemapUrl(
      new URL('https://voucha.ai/sitemaps/discussion/2026-03-14/1.xml?v=2'),
    )
    expect(result).not.toBeNull()
    expect(result?.search).toBe('')
    expect(result?.pathname).toBe('/sitemaps/discussion/2026-03-14/1.xml')
  })
})
