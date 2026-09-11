import { describe, expect, it } from 'vitest'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
  makeTopic,
  makeTopicsSearchResponse,
} from '@/test-helpers/api-responses'
import type { TrendingFeedsResponse, TrendingTopicsResponse } from '@/types/api-responses'
import {
  projectPlatformStats,
  projectTopCommunities,
  projectTopReferralPrograms,
  projectTrendingFeeds,
  projectTrendingTopics,
} from '../homepage-view-models'

describe('homepage view models', () => {
  it('projects trending feeds and topics to canonical display-only items', () => {
    const topic = makeTopic({
      id: 'feed-1',
      name: 'Planet Money (https://example.com)',
      slug: 'planet-money',
      topic_type: 'rss_feed',
    })
    const feeds = {
      results: [{ id: 'feed-1' }],
      rss_feeds: {
        'feed-1': { id: 'feed-1', title: 'Planet Money', feed_type: 'podcast', topic },
        orphan: { id: 'orphan', title: 'Orphan', feed_type: 'article', topic },
      },
    } as unknown as TrendingFeedsResponse
    expect(projectTrendingFeeds(feeds)).toEqual([
      {
        id: 'feed-1',
        title: 'Planet Money',
        displayName: 'Planet Money (Podcast)',
        href: '/source/planet-money',
      },
    ])

    const topics = {
      results: [{ id: topic.id }],
      topics: { [topic.id]: topic, orphan: makeTopic({ id: 'orphan' }) },
      topics_metrics: {
        [topic.id]: { bookmarks: { follow: 7 }, ratings: { count: { '5': 2 } } },
        orphan: { bookmarks: { follow: 99 } },
      },
    } as unknown as TrendingTopicsResponse
    expect(projectTrendingTopics(topics)).toEqual([
      expect.objectContaining({
        id: 'feed-1',
        href: '/source/planet-money',
        followerCount: 7,
        averageRating: 5,
      }),
    ])
  })

  it('projects and caps referral programs without carrying normalized maps', () => {
    const topics = Array.from({ length: 7 }, (_, index) =>
      makeTopic({
        id: `referral-${index}`,
        name: `Referral ${index}`,
        slug: `referral-${index}`,
        topic_type: 'referral_program',
      }),
    )
    const projected = projectTopReferralPrograms(makeTopicsSearchResponse({ topics }))
    expect(projected).toHaveLength(5)
    expect(projected?.[0]).toEqual({
      id: 'referral-0',
      name: 'Referral 0',
      href: '/referral-program/referral-0/referral-links',
    })
    expect(projected?.[0]).not.toHaveProperty('topic_type')
    expect(projected).not.toHaveProperty('topics')
  })

  it('preserves successful empty responses as empty arrays', () => {
    expect(
      projectTrendingFeeds({ results: [], rss_feeds: {} } as unknown as TrendingFeedsResponse),
    ).toEqual([])
    expect(
      projectTrendingTopics({
        results: [],
        topics: {},
        topics_metrics: {},
      } as unknown as TrendingTopicsResponse),
    ).toEqual([])
    expect(projectTopCommunities(makeCommunitiesSearchResponse({ communities: [] }))).toEqual([])
    expect(projectTopReferralPrograms(makeTopicsSearchResponse({ topics: [] }))).toEqual([])
  })

  it('projects feed, topic, community, referral, and platform responses to display-only data', () => {
    expect(
      projectPlatformStats({
        data_point_count: 1,
        topic_count: 2,
        review_count: 3,
        hostname_count: 4,
        rss_feed_count: 99,
        post_count: 98,
      }),
    ).toEqual({ data_point_count: 1, topic_count: 2, review_count: 3, hostname_count: 4 })

    const community = makeCommunity({ id: 'c-1', name: 'Cards', slug: 'cards' })
    expect(
      projectTopCommunities(makeCommunitiesSearchResponse({ communities: [community] })),
    ).toEqual([{ id: 'c-1', name: 'Cards', href: '/communities/cards', memberCount: 0 }])
  })

  it('preserves null responses and caps community and referral previews at five items', () => {
    expect(projectTrendingFeeds(null)).toBeNull()
    expect(projectTrendingTopics(null)).toBeNull()
    expect(projectTopCommunities(null)).toBeNull()
    expect(projectTopReferralPrograms(null)).toBeNull()
    expect(projectPlatformStats(null)).toBeNull()

    const communities = Array.from({ length: 7 }, (_, index) =>
      makeCommunity({ id: `c-${index}`, name: `Community ${index}`, slug: `community-${index}` }),
    )
    expect(projectTopCommunities(makeCommunitiesSearchResponse({ communities }))).toHaveLength(5)
  })
})
