import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  insertTestStory,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestProxyFollowCommunity,
  setTestItemStoryId,
  setTestRssFeedItemVotes,
} from '@voucha/test-helpers'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import { rssFeedItemPageConfig } from '../feed-page-config.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('bounded RSS feed windows', () => {
  it('caps empty story-suppressed windows after more than page+1 candidates', async () => {
    const viewer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(viewer, feedId)
    const story = await insertTestStory()
    const items = await Promise.all(
      [100, 90, 80, 70, 60, 50, 40, 30].map(rank =>
        createTestRssFeedItemWithUrl(feedId, {
          createdAt: new Date(Date.now() - (200 - rank) * 1000),
        }),
      ),
    )
    await Promise.all(
      items.map(async (item, index) => {
        await setTestItemStoryId(item.id, story.id)
        await setTestRssFeedItemVotes(item.id, index === 0 ? 1 : 0)
      }),
    )
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
      max_windows_per_page: 3,
    })
    try {
      const first = await getRssFeedItemFeedIds(viewer, {
        feed_type: 'follow_rss_feeds',
        time_range: 'all',
        limit: 1,
      })
      expect(first.results.map(row => row.entity_id)).toEqual([items[0]!.id])
      expect(first.page_info.has_next_page).toBe(true)
      const { queries } = await withCapturedTestQueries(() =>
        getRssFeedItemFeedIds(viewer, {
          feed_type: 'follow_rss_feeds',
          time_range: 'all',
          limit: 1,
          after: first.page_info.end_cursor ?? undefined,
        }),
      )
      const feedQueries = queries.filter(query =>
        query.text.includes('/* getRssFeedItemFeedIds */'),
      )
      expect(feedQueries).toHaveLength(3)
    } finally {
      restore()
    }
  })

  it('includes an unseen omitted-source floor when advancing an empty window', async () => {
    const viewer = await createTestUser()
    const topicA = await createTestTopic()
    const topicB = await createTestTopic()
    const [feedA, feedB] = await Promise.all([
      createTestRssFeedWithTiming(topicA.id),
      createTestRssFeedWithTiming(topicB.id),
    ])
    await Promise.all([followRssFeed(viewer, feedA), followRssFeed(viewer, feedB)])
    const now = Date.now()
    const atRank = (rank: number) => new Date(now - (300 - rank) * 1000)
    const itemA200 = await createTestRssFeedItemWithUrl(feedA, { createdAt: atRank(200) })
    const itemA100 = await createTestRssFeedItemWithUrl(feedA, { createdAt: atRank(100) })
    const itemB80 = await createTestRssFeedItemWithUrl(feedB, { createdAt: atRank(80) })
    const story = await insertTestStory({ officialRssFeedItemId: itemA200.id })
    await Promise.all([
      setTestItemStoryId(itemA200.id, story.id),
      setTestItemStoryId(itemA100.id, story.id),
      setTestRssFeedItemVotes(itemA200.id, 1),
      setTestRssFeedItemVotes(itemA100.id, 0),
    ])
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
      source_limit: 1,
    })
    try {
      const options = { feed_type: 'follow_rss_feeds', time_range: 'all', limit: 1 } as const
      const first = await getRssFeedItemFeedIds(viewer, options)
      expect(first.results.map(row => row.entity_id)).toEqual([itemA200.id])
      expect(first.page_info.has_next_page).toBe(true)
      const second = await getRssFeedItemFeedIds(viewer, {
        ...options,
        after: first.page_info.end_cursor ?? undefined,
      })
      expect(second.results.map(row => row.entity_id)).toEqual([itemB80.id])
      expect(second.page_info.has_next_page).toBe(false)
    } finally {
      restore()
    }
  })

  it('does not let an unfollowed popular feed veto a viewer-followed story member', async () => {
    const viewer = await createTestUser()
    const owner = await createTestUser()
    const [viewerTopic, popularTopic] = await Promise.all([createTestTopic(), createTestTopic()])
    const [viewerFeed, popularFeed] = await Promise.all([
      createTestRssFeedWithTiming(viewerTopic.id),
      createTestRssFeedWithTiming(popularTopic.id),
    ])
    await followRssFeed(viewer, viewerFeed)
    const communities = await Promise.all(
      Array.from({ length: 5 }, () => insertTestCommunity({ createdById: owner.id })),
    )
    await Promise.all(
      communities.map(community =>
        insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'rss_feed',
          entityId: popularFeed,
        }),
      ),
    )
    const now = Date.now()
    const popularItem = await createTestRssFeedItemWithUrl(popularFeed, {
      createdAt: new Date(now - 10_000),
    })
    const viewerItem = await createTestRssFeedItemWithUrl(viewerFeed, {
      createdAt: new Date(now - 20_000),
    })
    const story = await insertTestStory({ officialRssFeedItemId: popularItem.id })
    await Promise.all([
      setTestItemStoryId(popularItem.id, story.id),
      setTestItemStoryId(viewerItem.id, story.id),
      setTestRssFeedItemVotes(popularItem.id, 1),
      setTestRssFeedItemVotes(viewerItem.id, 0),
    ])

    const page = await getRssFeedItemFeedIds(viewer, {
      feed_type: 'follow_rss_feeds',
      time_range: 'all',
      limit: 10,
    })
    expect(page.results.map(row => row.entity_id)).toContain(viewerItem.id)
    expect(page.results.map(row => row.entity_id)).not.toContain(popularItem.id)
  })

  it('does not advertise out-of-range direct or proxy source heads after the last page', async () => {
    const viewer = await createTestUser()
    const owner = await createTestUser()
    const [directTopic, proxyTopic] = await Promise.all([createTestTopic(), createTestTopic()])
    const [directFeed, proxyFeed] = await Promise.all([
      createTestRssFeedWithTiming(directTopic.id),
      createTestRssFeedWithTiming(proxyTopic.id),
    ])
    await followRssFeed(viewer, directFeed)
    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'rss_feed',
        entityId: proxyFeed,
      }),
      insertTestProxyFollowCommunity(viewer.id, community.id),
    ])

    const asOf = new Date(Date.now())
    const cutoffMs = asOf.getTime() - DAY_MS
    const itemAt = (deltaMs: number) => new Date(cutoffMs + deltaMs)
    const directNewest = await createTestRssFeedItemWithUrl(directFeed, {
      createdAt: itemAt(20_000),
    })
    const proxyNewest = await createTestRssFeedItemWithUrl(proxyFeed, {
      createdAt: itemAt(10_000),
    })
    await Promise.all([
      createTestRssFeedItemWithUrl(directFeed, { createdAt: itemAt(-1_000) }),
      createTestRssFeedItemWithUrl(proxyFeed, { createdAt: itemAt(-2_000) }),
    ])

    const options = {
      feed_type: 'follow_rss_feeds',
      time_range: '1d',
      limit: 1,
    } as const
    const first = await getRssFeedItemFeedIds(viewer, options, asOf)
    expect(first.results.map(row => row.entity_id)).toEqual([directNewest.id])
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getRssFeedItemFeedIds(
      viewer,
      { ...options, after: first.page_info.end_cursor ?? undefined },
      asOf,
    )
    expect(second.results.map(row => row.entity_id)).toEqual([proxyNewest.id])
    expect(second.page_info.has_next_page).toBe(false)
  })
})
