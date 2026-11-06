import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
} from '@voucha/test-helpers'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import { rssFeedItemPageConfig } from '../feed-page-config.mts'

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
      expect(page.page_info.has_next_page).toBe(false)
    } finally {
      restore()
    }
  })
})
