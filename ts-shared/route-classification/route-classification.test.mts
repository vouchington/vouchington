import { describe, expect, it } from 'vitest'
import { isPrivateDiscoveryPath } from './discovery.mts'
import {
  COMMUNITY_PUBLIC_RESERVED_SEGMENTS,
  INDEXABLE_TOPIC_SUBPAGES,
  PRIVATE_DISCOVERY_EXACT_PATHS,
  PRIVATE_DISCOVERY_PREFIXES,
  PRIVATE_USER_PROFILE_COLLECTION_ROUTE_SUFFIXES,
  PUBLIC_STATIC_SITE_NAV_PATHS,
  ROBOTS_DISALLOW_PREFIXES,
} from './patterns.mts'
import {
  PRIVATE_USER_PROFILE_COLLECTIONS,
  getProfileCollectionRouteSuffix,
} from '@ts-shared/user-profile-collections'
describe('isPrivateDiscoveryPath', () => {
  describe('exact private paths', () => {
    it.each(['/admin', '/api', '/my', '/login', '/users', '/disputes'])(
      'returns true for %s exact match',
      path => {
        expect(isPrivateDiscoveryPath(path)).toBe(true)
      },
    )

    it('returns true for /disputes/ prefix', () => {
      expect(isPrivateDiscoveryPath('/disputes/case-123')).toBe(true)
    })

    it('returns true for /admin/topic-claims (covered by /admin/ prefix)', () => {
      expect(isPrivateDiscoveryPath('/admin/topic-claims')).toBe(true)
    })

    it('returns true for /admin/topic-claims/ prefix', () => {
      expect(isPrivateDiscoveryPath('/admin/topic-claims/some-claim')).toBe(true)
    })

    it('is case-insensitive for exact matches', () => {
      expect(isPrivateDiscoveryPath('/Admin')).toBe(true)
      expect(isPrivateDiscoveryPath('/MY')).toBe(true)
      expect(isPrivateDiscoveryPath('/API')).toBe(true)
    })

    it('strips query strings before classification (defensive)', () => {
      expect(isPrivateDiscoveryPath('/admin?token=xyz')).toBe(true)
      expect(isPrivateDiscoveryPath('/my?redirect=/')).toBe(true)
    })

    it('strips hash fragments before classification (defensive)', () => {
      expect(isPrivateDiscoveryPath('/admin#section')).toBe(true)
      expect(isPrivateDiscoveryPath('/my/profile#settings')).toBe(true)
    })
  })

  describe('prefix private paths', () => {
    it.each([
      '/my/profile',
      '/my/settings',
      '/api/v1/users',
      '/admin/users',
      '/auth/login',
      '/feed/updates',
      '/_next/static/chunk.js',
    ])('returns true for %s private prefix path', path => {
      expect(isPrivateDiscoveryPath(path)).toBe(true)
    })

    it('is case-insensitive for prefix matches', () => {
      expect(isPrivateDiscoveryPath('/My/profile')).toBe(true)
      expect(isPrivateDiscoveryPath('/API/v1')).toBe(true)
    })

    it('does not false-positive on path that shares a prefix string but not the trailing slash', () => {
      expect(isPrivateDiscoveryPath('/monitoring-dashboard')).toBe(false)
    })
  })

  describe('topic management regex', () => {
    it('returns true for topic settings pages', () => {
      expect(isPrivateDiscoveryPath('/topic/world-of-hyatt/settings')).toBe(true)
      expect(isPrivateDiscoveryPath('/card/chase-sapphire/settings')).toBe(true)
      expect(isPrivateDiscoveryPath('/rewards-program/amex/tags')).toBe(true)
      expect(isPrivateDiscoveryPath('/source/nytimes/validations')).toBe(true)
    })

    it('does not classify public topic sub-pages as private', () => {
      expect(isPrivateDiscoveryPath('/topic/world-of-hyatt/posts')).toBe(false)
      expect(isPrivateDiscoveryPath('/card/chase-sapphire/reviews')).toBe(false)
    })
  })

  describe('dynamic route patterns', () => {
    it('returns true for post edit pages', () => {
      expect(isPrivateDiscoveryPath('/review/my-review/edit')).toBe(true)
      expect(isPrivateDiscoveryPath('/article/my-article/tags')).toBe(true)
      expect(isPrivateDiscoveryPath('/discussion/some-topic/edit')).toBe(true)
    })

    it('returns true for create pages', () => {
      expect(isPrivateDiscoveryPath('/reviews/create')).toBe(true)
      expect(isPrivateDiscoveryPath('/discussions/create')).toBe(true)
      expect(isPrivateDiscoveryPath('/links/create')).toBe(true)
    })

    it('returns true for community management pages', () => {
      expect(isPrivateDiscoveryPath('/communities/my-club/settings')).toBe(true)
      expect(isPrivateDiscoveryPath('/communities/my-club/apply')).toBe(true)
      expect(isPrivateDiscoveryPath('/communities/my-club/posts/create')).toBe(true)
      expect(isPrivateDiscoveryPath('/communities/create')).toBe(true)
      expect(isPrivateDiscoveryPath('/communities/invite')).toBe(true)
    })

    it('returns true for url detail pages', () => {
      expect(isPrivateDiscoveryPath('/url/abc-123')).toBe(true)
      expect(isPrivateDiscoveryPath('/url/abc-123/crawls/xyz')).toBe(true)
    })

    it('returns true for user admin page', () => {
      expect(isPrivateDiscoveryPath('/user/jongle/admin')).toBe(true)
    })

    it('returns true for private user collection sub-pages (topics)', () => {
      expect(isPrivateDiscoveryPath('/user/jongle/topics/blocked')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/topics/muted')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/topics/viewed')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/topics/subscribed-posts')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/topics/subscribed-news')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/topics/dismissed-recommendations')).toBe(true)
    })

    it('returns true for private user collection sub-pages (users)', () => {
      expect(isPrivateDiscoveryPath('/user/jongle/users/blocked')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/users/muted')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/users/subscribed-posts')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/users/dismissed-recommendations')).toBe(true)
    })

    it('returns true for private user collection sub-pages (posts)', () => {
      expect(isPrivateDiscoveryPath('/user/jongle/posts/hidden')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/posts/saved')).toBe(true)
    })

    it('returns true for private user collection sub-pages (communities)', () => {
      expect(isPrivateDiscoveryPath('/user/jongle/communities/saved')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/communities/proxy-following')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/communities/proxy-muted')).toBe(true)
    })

    it('returns true for private rss-feed sub-pages', () => {
      expect(isPrivateDiscoveryPath('/user/jongle/rss-feeds/subscribed')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/rss-feeds/muted')).toBe(true)
    })

    it('returns true for private rss-feed-items sub-pages', () => {
      expect(isPrivateDiscoveryPath('/user/jongle/rss-feed-items/saved')).toBe(true)
      expect(isPrivateDiscoveryPath('/user/jongle/rss-feed-items/viewed')).toBe(true)
    })

    it('returns true for every catalog-private user collection sub-page', () => {
      const notPrivate = PRIVATE_USER_PROFILE_COLLECTIONS.filter(
        collection =>
          !isPrivateDiscoveryPath(`/user/jongle/${getProfileCollectionRouteSuffix(collection)}`),
      ).map(getProfileCollectionRouteSuffix)

      expect(notPrivate).toEqual([])
    })
  })

  describe('public paths return false', () => {
    it.each([
      '/',
      '/about',
      '/topics',
      '/reviews',
      '/communities',
      '/user/jongle',
      '/communities/my-club',
      '/review/my-review',
      '/article/my-article',
      '/topic/world-of-hyatt/posts',
      '/review/my-review/comment/some-id',
    ])('returns false for public path %s', path => {
      expect(isPrivateDiscoveryPath(path)).toBe(false)
    })
  })
})

describe('PUBLIC_STATIC_SITE_NAV_PATHS invariant', () => {
  it('no public static nav path is classified as private', () => {
    const violations = [...PUBLIC_STATIC_SITE_NAV_PATHS].filter(isPrivateDiscoveryPath)
    expect(violations).toEqual([])
  })
})

describe('ROBOTS_DISALLOW_PREFIXES', () => {
  it('blocks internal communication and support surfaces from crawler traversal', () => {
    expect(ROBOTS_DISALLOW_PREFIXES).toEqual(
      expect.arrayContaining([
        '/chat/',
        '/chat?',
        '/chat$',
        '/messages/',
        '/messages?',
        '/messages$',
        '/support/',
        '/support?',
        '/support$',
      ]),
    )
  })

  it('every robots disallow prefix is covered by the private path classifier', () => {
    const notCovered = ROBOTS_DISALLOW_PREFIXES.filter(prefix => {
      const exactPath = prefix.replace(/\$$/, '')
      const testPath = exactPath.endsWith('/')
        ? `${exactPath}something`
        : exactPath.endsWith('?')
          ? `${exactPath}status=resolved`
          : exactPath
      return !isPrivateDiscoveryPath(testPath)
    })
    expect(notCovered).toEqual([])
  })
})

describe('pattern exports', () => {
  it('PRIVATE_DISCOVERY_EXACT_PATHS is non-empty', () => {
    expect(PRIVATE_DISCOVERY_EXACT_PATHS.size).toBeGreaterThan(0)
  })

  it('PRIVATE_DISCOVERY_PREFIXES is non-empty', () => {
    expect(PRIVATE_DISCOVERY_PREFIXES.length).toBeGreaterThan(0)
  })

  it('INDEXABLE_TOPIC_SUBPAGES contains expected entries', () => {
    expect([...INDEXABLE_TOPIC_SUBPAGES].toSorted()).toEqual(
      ['data-points', 'latest', 'news', 'posts', 'referral-links', 'reviews'].toSorted(),
    )
  })

  it('COMMUNITY_PUBLIC_RESERVED_SEGMENTS contains expected entries', () => {
    const segments = [...COMMUNITY_PUBLIC_RESERVED_SEGMENTS]
    for (const entry of ['create', 'invite']) {
      expect(segments).toContain(entry)
    }
  })

  it('private user profile collection suffixes derive from the shared catalog', () => {
    expect(PRIVATE_USER_PROFILE_COLLECTION_ROUTE_SUFFIXES).toEqual(
      PRIVATE_USER_PROFILE_COLLECTIONS.map(getProfileCollectionRouteSuffix),
    )
  })
})
