import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  followTopic,
  followUser,
  insertTestStory,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestProxyFollowCommunity,
  setRssFeedItemShareSortAtForTest,
  setTestItemStoryId,
  setTestRssFeedItemVotes,
  addCategoryToRssFeedItem,
} from '@voucha/test-helpers'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import { rssFeedItemPageConfig } from '../feed-page-config.mts'
import {
  processFollowerDistributionChunk,
  shareRssFeedItemWithFollowers,
} from '@services/follower-distributions'

describe('bounded personalized RSS source pool', () => {
  it('keeps the most active followed source when the source cap is one', async () => {
    const viewer = await createTestUser()
    const [olderFeed, newerFeed] = await Promise.all([
      createTestRssFeedWithTiming((await createTestTopic()).id),
      createTestRssFeedWithTiming((await createTestTopic()).id),
    ])
    await Promise.all([followRssFeed(viewer, olderFeed), followRssFeed(viewer, newerFeed)])
    const older = await createTestRssFeedItemWithUrl(olderFeed, {
      createdAt: new Date(Date.now() - 60_000),
    })
    const newer = await createTestRssFeedItemWithUrl(newerFeed)
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
      source_limit: 1,
    })
    try {
      const page = await getRssFeedItemFeedIds(viewer, {
        feed_type: 'follow_rss_feeds',
        time_range: 'all',
        limit: 10,
      })
      expect(page.results.map(row => row.entity_id)).toEqual([newer.id])
      expect(page.results.map(row => row.entity_id)).not.toContain(older.id)
      expect(page.page_info.has_next_page).toBe(true)
    } finally {
      restore()
    }
  })

  it('admits a source outside the first top-source set when its head outranks remaining items', async () => {
    const viewer = await createTestUser()
    const [feedA, feedB] = await Promise.all([
      createTestRssFeedWithTiming((await createTestTopic()).id),
      createTestRssFeedWithTiming((await createTestTopic()).id),
    ])
    await Promise.all([followRssFeed(viewer, feedA), followRssFeed(viewer, feedB)])
    const now = Date.now()
    const atRank = (rank: number) => new Date(now - (200 - rank) * 1000)
    const itemA100 = await createTestRssFeedItemWithUrl(feedA, {
      createdAt: atRank(100),
    })
    const itemA60 = await createTestRssFeedItemWithUrl(feedA, {
      createdAt: atRank(60),
    })
    const itemA20 = await createTestRssFeedItemWithUrl(feedA, {
      createdAt: atRank(20),
    })
    const itemB80 = await createTestRssFeedItemWithUrl(feedB, {
      createdAt: atRank(80),
    })
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
      source_limit: 1,
    })
    try {
      const options = { feed_type: 'follow_rss_feeds', time_range: 'all', limit: 1 } as const
      const ids: string[] = []
      let after: string | undefined
      for (let index = 0; index < 4; index++) {
        const page = await getRssFeedItemFeedIds(viewer, { ...options, after })
        ids.push(...page.results.map(row => row.entity_id))
        expect(page.results).toHaveLength(1)
        expect(page.page_info.has_next_page).toBe(index < 3)
        after = page.page_info.end_cursor ?? undefined
      }
      expect(ids).toEqual([itemA100.id, itemB80.id, itemA60.id, itemA20.id])
    } finally {
      restore()
    }
  })

  it('retains the third proxy community through duplicate source heads', async () => {
    const viewer = await createTestUser()
    const owner = await createTestUser()
    const [topicA, topicB] = await Promise.all([createTestTopic(), createTestTopic()])
    const [feedA, feedB] = await Promise.all([
      createTestRssFeedWithTiming(topicA.id),
      createTestRssFeedWithTiming(topicB.id),
    ])
    const communities = await Promise.all(
      Array.from({ length: 3 }, () => insertTestCommunity({ createdById: owner.id })),
    )
    const omittedOnDuplicateHead = [...communities].toSorted((a, b) => a.id.localeCompare(b.id))[0]!
    await Promise.all(
      communities.flatMap(community => [
        insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'rss_feed',
          entityId: feedA,
        }),
        insertTestProxyFollowCommunity(viewer.id, community.id),
      ]),
    )
    await insertTestCommunityListItem({
      communityId: omittedOnDuplicateHead.id,
      itemType: 'rss_feed',
      entityId: feedB,
    })

    const now = Date.now()
    const atRank = (rank: number) => new Date(now - (200 - rank) * 1000)
    const itemA100 = await createTestRssFeedItemWithUrl(feedA, {
      createdAt: atRank(100),
    })
    const itemA20 = await createTestRssFeedItemWithUrl(feedA, {
      createdAt: atRank(20),
    })
    const itemB80 = await createTestRssFeedItemWithUrl(feedB, {
      createdAt: atRank(80),
    })
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
      source_limit: 1,
    })
    try {
      const options = { feed_type: 'follow_rss_feeds', time_range: 'all', limit: 1 } as const
      const ids: string[] = []
      let after: string | undefined
      let terminalPage: Awaited<ReturnType<typeof getRssFeedItemFeedIds>> | undefined
      for (let index = 0; index < 4; index++) {
        const page = await getRssFeedItemFeedIds(viewer, { ...options, after })
        ids.push(...page.results.map(row => row.entity_id))
        if (page.results.length === 0) {
          terminalPage = page
          break
        }
        expect(page.results).toHaveLength(1)
        after = page.page_info.end_cursor ?? undefined
      }
      expect(terminalPage?.page_info.has_next_page).toBe(false)
      expect(terminalPage?.page_info.end_cursor).toBeNull()
      expect(ids).toEqual([itemA100.id, itemB80.id, itemA20.id])
    } finally {
      restore()
    }
  })

  it('advances past a saturated filtered source window before merging a share', async () => {
    const viewer = await createTestUser()
    const sharer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await Promise.all([followRssFeed(viewer, feedId), followUser(viewer, sharer)])

    const now = Date.now()
    const atRank = (rank: number) => new Date(now - (200 - rank) * 1000)
    const rankedItems = await Promise.all(
      [100, 95, 90, 85, 80, 75, 70, 60].map(rank =>
        createTestRssFeedItemWithUrl(feedId, { createdAt: atRank(rank) }),
      ),
    )
    const [itemA100, itemB95, itemC90, itemD85, itemE80, itemF75, itemG70, itemH60] = rankedItems
    const duplicateStory = await insertTestStory({ officialRssFeedItemId: itemA100!.id })
    await Promise.all([
      setTestItemStoryId(itemA100!.id, duplicateStory.id),
      ...[itemB95, itemC90, itemD85, itemE80, itemF75, itemG70].map(item =>
        setTestItemStoryId(item!.id, duplicateStory.id),
      ),
      setTestRssFeedItemVotes(itemA100!.id, 1),
      ...[itemB95, itemC90, itemD85, itemE80, itemF75, itemG70].map(item =>
        setTestRssFeedItemVotes(item!.id, 0),
      ),
    ])

    const shareItem = await createTestRssFeedItemWithUrl(
      await createTestRssFeedWithTiming((await createTestTopic()).id),
      { createdAt: atRank(50) },
    )
    const distribution = await shareRssFeedItemWithFollowers(sharer, shareItem.id)
    await processFollowerDistributionChunk(distribution.distribution_id)
    await setRssFeedItemShareSortAtForTest({
      recipientUserId: viewer.id,
      rssFeedItemId: shareItem.id,
      sharedByUserId: sharer.id,
      sortAt: atRank(50).toISOString(),
    })

    const options = { feed_type: 'any', time_range: 'all', limit: 1 } as const
    const expected = [
      [itemA100!.id, 'direct'],
      [itemH60!.id, 'direct'],
      [shareItem.id, 'share'],
    ]
    let after: string | undefined
    for (const [index, delivery] of expected.entries()) {
      const page = await getRssFeedItemFeedIds(viewer, { ...options, after })
      expect(page.results.map(row => [row.entity_id, row.delivery_type])).toEqual([delivery])
      expect(page.page_info.has_next_page).toBe(index < expected.length - 1)
      after = page.page_info.end_cursor ?? undefined
    }
  })

  it('returns once an item matched by both followed source kinds with a source cap of one', async () => {
    const viewer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await Promise.all([followRssFeed(viewer, feedId), followTopic(viewer, topic)])
    const item = await createTestRssFeedItemWithUrl(feedId)
    await Promise.all([
      addCategoryToRssFeedItem(item.id, topic.id),
      setTestRssFeedItemVotes(item.id, 1),
    ])
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
      source_limit: 1,
    })
    try {
      const page = await getRssFeedItemFeedIds(viewer, {
        feed_type: 'all',
        time_range: 'all',
        limit: 10,
      })
      expect(page.results.map(row => row.entity_id)).toEqual([item.id])
    } finally {
      restore()
    }
  })
})
