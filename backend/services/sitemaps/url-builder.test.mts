import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildFamilySitemapUrl,
  buildPostUrl,
  buildSitemapUrl,
  buildPostSitemapUrl,
} from './url-builder.mts'
import type { SitemapPost } from './types.mts'

describe('URL Builder', () => {
  beforeEach(() => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('buildPostUrl', () => {
    it('should build URL for discussion post', () => {
      const post: SitemapPost = {
        slug: 'test-discussion',
        post_type: 'discussion',
        updated_at: new Date('2026-01-25T12:00:00Z'),
      }

      const result = buildPostUrl(post)

      expect(result).toBe('https://test.com/discussion/test-discussion')
    })

    it('should build URL for review post', () => {
      const post: SitemapPost = {
        slug: 'test-review',
        post_type: 'review',
        updated_at: new Date('2026-01-25T12:00:00Z'),
      }

      const result = buildPostUrl(post)

      expect(result).toBe('https://test.com/review/test-review')
    })

    it('should build canonical route segments for every sitemap post type', () => {
      expect(
        buildPostUrl({
          slug: 'test-article',
          post_type: 'article',
          updated_at: new Date('2026-01-25T12:00:00Z'),
        }),
      ).toBe('https://test.com/article/test-article')
      expect(
        buildPostUrl({
          slug: 'test-blog',
          post_type: 'blog_post',
          updated_at: new Date('2026-01-25T12:00:00Z'),
        }),
      ).toBe('https://test.com/blog-post/test-blog')
      expect(
        buildPostUrl({
          slug: 'test-data-point',
          post_type: 'data_point',
          updated_at: new Date('2026-01-25T12:00:00Z'),
        }),
      ).toBe('https://test.com/data-point/test-data-point')
      expect(
        buildPostUrl({
          slug: 'test-link',
          post_type: 'link',
          updated_at: new Date('2026-01-25T12:00:00Z'),
        }),
      ).toBe('https://test.com/link/test-link')
      expect(
        buildPostUrl({
          slug: 'test-story',
          post_type: 'story',
          updated_at: new Date('2026-01-25T12:00:00Z'),
        }),
      ).toBe('https://test.com/story/test-story')
    })

    it('should handle base URL with trailing slash', () => {
      vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com/')

      const post: SitemapPost = {
        slug: 'test-slug',
        post_type: 'discussion',
        updated_at: new Date('2026-01-25T12:00:00Z'),
      }

      const result = buildPostUrl(post)

      expect(result).toBe('https://test.com/discussion/test-slug')
    })
  })

  describe('buildSitemapUrl', () => {
    it('should build sitemap URL from path', () => {
      const result = buildSitemapUrl('sitemaps/discussion.xml')

      expect(result).toBe('https://test.com/sitemaps/discussion.xml')
    })

    it('should handle path with leading slash', () => {
      const result = buildSitemapUrl('/sitemaps/discussion.xml')

      expect(result).toBe('https://test.com/sitemaps/discussion.xml')
    })

    it('should handle base URL with trailing slash', () => {
      vi.stubEnv('SITEMAP_BASE_URL', 'https://test.com/')

      const result = buildSitemapUrl('sitemaps/discussion.xml')

      expect(result).toBe('https://test.com/sitemaps/discussion.xml')
    })
  })

  describe('buildPostSitemapUrl', () => {
    it('should build sitemap URL with post updated_at', () => {
      const post: SitemapPost = {
        slug: 'test-slug',
        post_type: 'discussion',
        updated_at: new Date('2026-01-25T12:00:00.000Z'),
      }

      const result = buildPostSitemapUrl(post)

      expect(result).toEqual({
        loc: 'https://test.com/discussion/test-slug',
        lastmod: '2026-01-25T12:00:00.000Z',
      })
    })

    it('should use review_updated_at when more recent than post updated_at', () => {
      const post: SitemapPost = {
        slug: 'test-review',
        post_type: 'review',
        updated_at: new Date('2026-01-25T12:00:00.000Z'),
        review_updated_at: new Date('2026-01-26T12:00:00.000Z'),
      }

      const result = buildPostSitemapUrl(post)

      expect(result.lastmod).toBe('2026-01-26T12:00:00.000Z')
    })

    it('should use post updated_at when review_updated_at is older', () => {
      const post: SitemapPost = {
        slug: 'test-review',
        post_type: 'review',
        updated_at: new Date('2026-01-26T12:00:00.000Z'),
        review_updated_at: new Date('2026-01-25T12:00:00.000Z'),
      }

      const result = buildPostSitemapUrl(post)

      expect(result.lastmod).toBe('2026-01-26T12:00:00.000Z')
    })

    it('should use post updated_at when review_updated_at is null', () => {
      const post: SitemapPost = {
        slug: 'test-review',
        post_type: 'review',
        updated_at: new Date('2026-01-25T12:00:00.000Z'),
        review_updated_at: null,
      }

      const result = buildPostSitemapUrl(post)

      expect(result.lastmod).toBe('2026-01-25T12:00:00.000Z')
    })

    it('should use post updated_at when review_updated_at is undefined', () => {
      const post: SitemapPost = {
        slug: 'test-discussion',
        post_type: 'discussion',
        updated_at: new Date('2026-01-25T12:00:00.000Z'),
      }

      const result = buildPostSitemapUrl(post)

      expect(result.lastmod).toBe('2026-01-25T12:00:00.000Z')
    })
  })

  describe('buildFamilySitemapUrl', () => {
    it('should build family URL entries with lastmod', () => {
      expect(
        buildFamilySitemapUrl({
          path: '/@testuser/gear',
          updated_at: new Date('2026-02-03T04:05:06.000Z'),
        }),
      ).toEqual({
        loc: 'https://test.com/@testuser/gear',
        lastmod: '2026-02-03T04:05:06.000Z',
      })
    })
  })
})
