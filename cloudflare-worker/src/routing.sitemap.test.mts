import { describe, expect, it } from 'vitest'
import { getSitemapOriginPath, isSitemapRoute } from './routing.mts'

describe('sitemap routing', () => {
  it('identifies sitemap routes', () => {
    expect(isSitemapRoute('/sitemap.xml')).toBe(true)
    expect(isSitemapRoute('/sitemaps/topic.xml')).toBe(true)
    expect(isSitemapRoute('/sitemap/topic.xml')).toBe(true)
    expect(isSitemapRoute('/api/v1/posts')).toBe(false)
  })

  it('maps sitemap paths to the correct origin keys', () => {
    expect(getSitemapOriginPath('/sitemap.xml')).toBe('/sitemaps/root.xml')
    expect(getSitemapOriginPath('/sitemaps/root.xml')).toBe('/sitemaps/root.xml')
    expect(getSitemapOriginPath('/sitemaps/posts.xml')).toBe('/sitemaps/posts.xml')
    expect(getSitemapOriginPath('/sitemaps/static.xml')).toBe('/sitemaps/static.xml')
    expect(getSitemapOriginPath('/sitemaps/discussion.xml')).toBe('/sitemaps/types/discussion.xml')
    expect(getSitemapOriginPath('/sitemaps/data_point.xml')).toBe('/sitemaps/types/data_point.xml')
    expect(getSitemapOriginPath('/sitemaps/blog_post.xml')).toBe('/sitemaps/types/blog_post.xml')
    expect(getSitemapOriginPath('/sitemaps/users.xml')).toBe('/sitemaps/families/users.xml')
    expect(getSitemapOriginPath('/sitemaps/landing-pages.xml')).toBe(
      '/sitemaps/families/landing-pages.xml',
    )
    expect(
      getSitemapOriginPath('/sitemaps/landing-pages/11111111-1111-4111-8111-111111111111/12.xml'),
    ).toBe('/families/landing-pages/11111111-1111-4111-8111-111111111111/12.xml')
    expect(getSitemapOriginPath('/sitemaps/discussion/2026-03-04/index.xml')).toBe(
      '/posts/2026/03/04/discussion/index.xml',
    )
    expect(
      getSitemapOriginPath(
        '/sitemaps/discussion/2026-03-04/11111111-1111-4111-8111-111111111111/2.xml',
      ),
    ).toBe('/posts/2026/03/04/discussion/11111111-1111-4111-8111-111111111111/2.xml')
  })

  it('rejects non-xml sitemap paths', () => {
    expect(getSitemapOriginPath('/sitemaps/meta/posts-tracked-range.json')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/not-a-type.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/posts/1.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion/2026-03-04/2.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/not-a-type/2026-03-04/index.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/not-a-type/2026-03-04/1.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion/2026-03-04/0.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemap/discussion.xml')).toBeNull()
  })

  it('rejects sitemap day paths with impossible calendar dates', () => {
    expect(getSitemapOriginPath('/sitemaps/discussion/2026-00-12/index.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion/2026-13-12/index.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion/2026-01-00/index.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion/2026-02-29/index.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion/2026-02-30/1.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion/2026-04-31/1.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion/1900-02-29/index.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion/2000-02-29/index.xml')).toBe(
      '/posts/2000/02/29/discussion/index.xml',
    )
    expect(getSitemapOriginPath('/sitemaps/discussion/2028-02-29/index.xml')).toBe(
      '/posts/2028/02/29/discussion/index.xml',
    )
  })

  it('rejects encoded sitemap traversal path characters', () => {
    expect(getSitemapOriginPath('/sitemaps/%2e%2e%2fetc%2fpasswd.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/%2E%2E%2Fetc%2Fpasswd.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion%2f2026-03-04%2findex.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/discussion%5c2026-03-04%5cindex.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/%2ereview.xml')).toBeNull()
    expect(getSitemapOriginPath('/sitemaps/%252e%252e%252fetc.xml')).toBeNull()
  })
})
