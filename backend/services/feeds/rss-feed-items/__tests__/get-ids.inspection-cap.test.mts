import { afterEach, describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
} from '@voucha/test-helpers'
import { rssFeedItemsWorkConfig } from '@services/rss-feed-items/work-limits'
import { getRssFeedItemFeedIds } from '../get-ids.mts'

describe('signed-in RSS feed candidate inspection cap', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it('returns a continuation cursor when the cap ends the walk before a page fills', async () => {
    const viewer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(viewer, feedId)
    await createTestRssFeedItemWithUrl(feedId)
    restore = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      feed_candidate_inspection_cap: 1,
    })

    const page = await getRssFeedItemFeedIds(viewer, { feed_type: 'follow_rss_feeds', limit: 10 })

    expect(page.results.length).toBeLessThanOrEqual(1)
    expect(page.page_info.has_next_page).toBe(true)
    expect(page.page_info.end_cursor).not.toBeNull()
  })

  it('does not change a page that fits inside the cap', async () => {
    const viewer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(viewer, feedId)
    const item = await createTestRssFeedItemWithUrl(feedId)

    const page = await getRssFeedItemFeedIds(viewer, { feed_type: 'follow_rss_feeds', limit: 10 })

    expect(page.results.map(row => row.entity_id)).toEqual([item.id])
    expect(page.page_info.has_next_page).toBe(false)
  })
})
