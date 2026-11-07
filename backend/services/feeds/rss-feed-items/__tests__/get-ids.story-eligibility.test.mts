import { describe, expect, it } from 'vitest'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestStory,
  setTestItemStoryId,
  setTestRssFeedItemVotes,
} from '@voucha/test-helpers'
import { getRssFeedItemFeedIds } from '../get-ids.mts'

describe('RSS feed story eligibility', () => {
  it('does not let a popular feed in unrelated community lists veto the followed story member', async () => {
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
      limit: 10,
    })
    expect(page.results.map(row => row.entity_id)).toContain(viewerItem.id)
    expect(page.results.map(row => row.entity_id)).not.toContain(popularItem.id)
  })
})
