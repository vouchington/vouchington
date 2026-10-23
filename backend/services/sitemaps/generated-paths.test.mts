import { describe, expect, it } from 'vitest'
import {
  buildFamilyIndexRoutePath,
  buildFamilyIndexStorageKey,
  buildFamilyMetaStorageKey,
  buildFamilyPageRoutePath,
  buildFamilyPageStorageKey,
  buildPostDayIndexRoutePath,
  buildPostDayIndexStorageKey,
  buildPostDayMetaStorageKey,
  buildPostDayPageRoutePath,
  buildPostDayPageStorageKey,
  buildPostsIndexRoutePath,
  buildPostsIndexStorageKey,
  buildRootSitemapStorageKey,
  buildStaticPagesRoutePath,
  buildStaticPagesStorageKey,
  buildTypeIndexRoutePath,
  buildTypeIndexStorageKey,
} from './generated-paths.mts'

describe('generated sitemap paths', () => {
  const generationId = '11111111-1111-4111-8111-111111111111'
  it('builds route paths for daily post sitemaps', () => {
    expect(buildPostsIndexRoutePath()).toBe('sitemaps/posts.xml')
    expect(buildStaticPagesRoutePath()).toBe('sitemaps/static.xml')
    expect(buildTypeIndexRoutePath('discussion')).toBe('sitemaps/discussion.xml')
    expect(buildFamilyIndexRoutePath('landing-pages')).toBe('sitemaps/landing-pages.xml')
    expect(buildFamilyPageRoutePath('landing-pages', generationId, 3)).toBe(
      `sitemaps/landing-pages/${generationId}/3.xml`,
    )
    expect(buildPostDayIndexRoutePath('discussion', '2026-03-04')).toBe(
      'sitemaps/discussion/2026-03-04/index.xml',
    )
    expect(buildPostDayPageRoutePath('discussion', '2026-03-04', generationId, 3)).toBe(
      `sitemaps/discussion/2026-03-04/${generationId}/3.xml`,
    )
  })

  it('builds storage keys with date-first layout', () => {
    expect(buildRootSitemapStorageKey()).toBe('sitemaps/root.xml')
    expect(buildPostsIndexStorageKey()).toBe('sitemaps/posts.xml')
    expect(buildStaticPagesStorageKey()).toBe('sitemaps/static.xml')
    expect(buildTypeIndexStorageKey('review')).toBe('sitemaps/types/review.xml')
    expect(buildFamilyIndexStorageKey('landing-pages')).toBe('sitemaps/families/landing-pages.xml')
    expect(buildFamilyPageStorageKey('landing-pages', generationId, 2)).toBe(
      `families/landing-pages/${generationId}/2.xml`,
    )
    expect(buildFamilyMetaStorageKey('landing-pages')).toBe('families/landing-pages/_meta.json')
    expect(buildPostDayIndexStorageKey('review', '2026-03-04')).toBe(
      'posts/2026/03/04/review/index.xml',
    )
    expect(buildPostDayPageStorageKey('review', '2026-03-04', generationId, 2)).toBe(
      `posts/2026/03/04/review/${generationId}/2.xml`,
    )
    expect(buildPostDayMetaStorageKey('review', '2026-03-04')).toBe(
      'posts/2026/03/04/review/_meta.json',
    )
  })
})
