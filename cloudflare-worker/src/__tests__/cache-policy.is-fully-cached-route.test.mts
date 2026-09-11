import { describe, expect, it } from 'vitest'
import { isFullyCachedRoute } from '../cache-route-policy.mts'

describe('isFullyCachedRoute', () => {
  const staticPaths = new Set(['/favicon.ico', '/robots.txt'])

  it('treats sitemap routes as fully cached', () => {
    expect(isFullyCachedRoute('/sitemap.xml', staticPaths)).toBe(true)
    expect(isFullyCachedRoute('/sitemaps/topic.xml', staticPaths)).toBe(true)
  })

  it('treats RSS routes as fully cached', () => {
    expect(isFullyCachedRoute('/rss', staticPaths)).toBe(true)
    expect(isFullyCachedRoute('/rss/', staticPaths)).toBe(true)
    expect(isFullyCachedRoute('/rss/posts', staticPaths)).toBe(true)
    expect(isFullyCachedRoute('/rss/news', staticPaths)).toBe(true)
  })

  it('treats configured static paths as fully cached', () => {
    expect(isFullyCachedRoute('/robots.txt', staticPaths)).toBe(true)
    expect(isFullyCachedRoute('/favicon.ico', staticPaths)).toBe(true)
  })

  it('does not treat other paths as fully cached', () => {
    expect(isFullyCachedRoute('/api/v1/posts', staticPaths)).toBe(false)
    expect(isFullyCachedRoute('/blog', staticPaths)).toBe(false)
  })
})
