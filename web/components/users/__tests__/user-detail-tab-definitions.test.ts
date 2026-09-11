// @vitest-environment node
import type { Translator } from '@ts-shared/ui-messages'
import type { UserMetrics } from '@/types/user'
import { describe, expect, it } from 'vitest'
import { buildUserProfileDropdownItems } from '../user-detail-tab-definitions'

const t: Translator = (key, params) => (params?.count ? `${key}:${String(params.count)}` : key)

interface UserMetricsOverrides extends Omit<Partial<UserMetrics>, 'count' | 'viewer_count'> {
  count?: Partial<UserMetrics['count']>
  viewer_count?: Partial<NonNullable<UserMetrics['viewer_count']>>
}

function makeUserMetrics(overrides: UserMetricsOverrides = {}): UserMetrics {
  return {
    __entity_type: 'user_metrics',
    id: 'metrics-user-1',
    count: {
      reviews: 0,
      discussions: 0,
      comments: 0,
      users_following: 0,
      users_followers: 0,
      topics_following: 0,
      rss_feeds_following: 0,
      communities_member: 0,
      ...overrides.count,
    },
    viewer_count: overrides.viewer_count
      ? {
          reviews: 0,
          discussions: 0,
          comments: 0,
          ...overrides.viewer_count,
        }
      : undefined,
    private_count: overrides.private_count,
    bookmarks: overrides.bookmarks ?? {
      follow: {
        topics: 0,
        posts: 0,
        users: 0,
      },
    },
    bookmarkers: overrides.bookmarkers ?? {
      follow: 0,
    },
    bookmarks__updated_at: overrides.bookmarks__updated_at ?? '2026-07-14T00:00:00.000Z',
  }
}

describe('buildUserProfileDropdownItems', () => {
  it.each(['about', 'topics', 'communities'] as const)('hides dropdown items for %s', tabName => {
    expect(buildUserProfileDropdownItems(t, tabName, 'alice', undefined, '', 'en')).toBeNull()
  })

  it('builds post dropdown items from public and viewer-visible metrics', () => {
    const tabs = buildUserProfileDropdownItems(
      t,
      'posts',
      'alice',
      makeUserMetrics({
        count: {
          reviews: 2,
          comments: 1,
        },
        viewer_count: {
          reviews: 4,
          discussions: 1,
          comments: 1,
        },
      }),
      '/posts',
      'en',
    )

    expect(tabs).toEqual([
      expect.objectContaining({
        value: 'posts-all',
        label: 'extracted.users.userDetailTabDefinitions.allCount_a58a7734:3+',
        href: '/user/alice/posts',
        routeSuffix: '/posts',
      }),
      expect.objectContaining({
        value: 'discussions',
        label: 'extracted.users.userDetailTabBuilders.discussionsCount_fb82771e:0+',
        href: '/user/alice/discussions',
      }),
      expect.objectContaining({
        value: 'reviews',
        label: 'extracted.users.userDetailTabBuilders.reviewsCount_7dc3b459:2+',
        href: '/user/alice/reviews',
      }),
      expect.objectContaining({
        value: 'comments',
        label: 'extracted.users.userDetailTabBuilders.commentsCount_147198f2:1',
        href: '/user/alice/comments',
      }),
    ])
  })

  it('keeps an active zero-count friends tab visible', () => {
    expect(
      buildUserProfileDropdownItems(
        t,
        'friends',
        'alice',
        makeUserMetrics(),
        '/users/followers',
        'en',
      ),
    ).toEqual([
      expect.objectContaining({
        value: 'users-followers',
        label: 'extracted.users.userDetailTabBuilders.followedByCount_0849e5b9:0',
        href: '/user/alice/users/followers',
      }),
    ])
  })

  it('builds source feed type filters and active state from the current feed type', () => {
    const tabs = buildUserProfileDropdownItems(
      t,
      'sources',
      'alice',
      makeUserMetrics({
        count: {
          rss_feeds_following: 7,
        },
      }),
      '/rss-feeds/following',
      'en',
      'podcast',
    )

    expect(tabs).toEqual([
      expect.objectContaining({
        value: 'sources-all',
        active: false,
        href: '/user/alice/rss-feeds/following',
      }),
      expect.objectContaining({
        value: 'sources-news',
        active: false,
        href: '/user/alice/rss-feeds/following?feed_type=article',
      }),
      expect.objectContaining({
        value: 'sources-podcasts',
        active: true,
        href: '/user/alice/rss-feeds/following?feed_type=podcast',
      }),
      expect.objectContaining({
        value: 'sources-videos',
        active: false,
        href: '/user/alice/rss-feeds/following?feed_type=video',
      }),
    ])
  })

  it('returns no source filters when counts are empty and the route is outside sources', () => {
    expect(
      buildUserProfileDropdownItems(t, 'sources', 'alice', makeUserMetrics(), '/posts', 'en'),
    ).toEqual([])
  })
})
