import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  followRssFeed,
  followUser,
  insertTestStory,
  setTestItemStoryId,
  setRssFeedItemShareSortAtForTest,
} from '@voucha/test-helpers'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import { upsertRssFeedItems } from '../../../rss-feed-items/upsert.mts'
import { processFollowerDistributionChunk } from '@services/follower-distributions'
import { shareRssFeedItemWithFollowers } from '../../share-actions.mts'

describe('RSS feed precise pagination', () => {
  it('traverses exact publication ties without gaps', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)
    const items = await upsertRssFeedItems(
      feedId,
      [456, 456, 455, 0].map(microseconds => {
        const guid = randomUUID()
        return {
          guid,
          link: `https://example.com/${guid}`,
          title: 'Precise publication',
          isoDate: `2020-01-02T03:04:05.123${String(microseconds).padStart(3, '0')}Z`,
        }
      }),
    )
    const expected = [items[0].id, items[1].id]
      .toSorted()
      .reverse()
      .concat(items.slice(2).map(item => item.id))
    const seen: string[] = []
    let after: string | undefined
    for (let page = 0; page < 5; page++) {
      const result = await getRssFeedItemFeedIds(user, {
        feed_type: 'follow_rss_feeds',
        time_range: 'all',
        limit: 1,
        after,
      })
      seen.push(...result.results.map(item => item.entity_id))
      if (!result.page_info.has_next_page) break
      expect(result.page_info.end_cursor).toEqual(expect.any(String))
      after = result.page_info.end_cursor!
    }
    expect(seen).toEqual(expected)
  })
  it('traverses direct and multiple shared delivery tiers at exact microsecond ties', async () => {
    const user = await createTestUser()
    const sharers = [await createTestUser(), await createTestUser()]
    const feedId = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(user, feedId)
    for (const sharer of sharers) await followUser(user, sharer)
    const timestamp = '2020-01-02T03:04:05.123456Z'
    const items = await upsertRssFeedItems(
      feedId,
      [timestamp, timestamp, '2020-01-02T03:04:05.123455Z'].map(isoDate => {
        const guid = randomUUID()
        return { guid, link: `https://example.com/${guid}`, title: 'Tied delivery', isoDate }
      }),
    )
    const story = await insertTestStory({ officialRssFeedItemId: items[0].id })
    await setTestItemStoryId(items[0].id, story.id)
    await setTestItemStoryId(items[1].id, story.id)
    for (const [index, sharer] of sharers.entries()) {
      await processFollowerDistributionChunk(
        (await shareRssFeedItemWithFollowers(sharer, items[index].id)).distribution_id,
      )
      await setRssFeedItemShareSortAtForTest({
        recipientUserId: user.id,
        rssFeedItemId: items[index].id,
        sharedByUserId: sharer.id,
        sortAt: timestamp,
      })
    }
    const options = { time_range: 'all' as const, limit: 1 }
    const results = []
    let after: string | undefined
    for (let page = 0; page < 5; page++) {
      const result = await getRssFeedItemFeedIds(user, { ...options, after })
      results.push(...result.results)
      if (!result.page_info.has_next_page) break
      after = result.page_info.end_cursor!
    }
    expect(results).toHaveLength(4)
    expect(results.slice(0, 2).map(result => result.delivery_type)).toEqual(['share', 'share'])
    expect(results[0].id.localeCompare(results[1].id)).toBeGreaterThan(0)
    expect(results.slice(2).map(result => result.entity_id)).toEqual([items[0].id, items[2].id])
    expect(new Set(results.map(result => result.id)).size).toBe(4)
    const cursor = (await getRssFeedItemFeedIds(user, options)).page_info.end_cursor!
    await expect(
      getRssFeedItemFeedIds(user, { ...options, feed_type: 'follow_rss_feeds', after: cursor }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      getRssFeedItemFeedIds(user, { ...options, community_id: randomUUID(), after: cursor }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      getRssFeedItemFeedIds(sharers[0], { ...options, after: cursor }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
