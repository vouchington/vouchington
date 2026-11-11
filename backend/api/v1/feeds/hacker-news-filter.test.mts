import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, followRssFeed, followUser } from '@voucha/test-helpers'
import {
  createHackerNewsFeedFilterFixture,
  readHackerNewsFilteredItemIds,
} from '@voucha/test-helpers/hacker-news-feed-filter'
import {
  processFollowerDistributionChunk,
  shareRssFeedItemWithFollowers,
} from '@services/follower-distributions'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

describe('personalized RSS Hacker News filter', () => {
  it('filters direct feed items for each accepted boolean spelling', async () => {
    const { user, feedId, seen, plain } = await createHackerNewsFeedFilterFixture()
    await followRssFeed(user, feedId)
    const request = createRequest()
    await request.authenticateAs(user)

    expect(await readHackerNewsFilteredItemIds(request, 'follow_rss_feeds')).toEqual([
      [seen.id],
      [seen.id],
      [seen.id],
      [plain.id],
      [plain.id],
      [plain.id],
    ])
  })

  it('filters shared feed items for each accepted boolean spelling', async () => {
    const [{ user, seen, plain }, sharer] = await Promise.all([
      createHackerNewsFeedFilterFixture(),
      createTestUser(),
    ])
    await followUser(user, sharer)
    for (const item of [seen, plain]) {
      const distribution = await shareRssFeedItemWithFollowers(sharer, item.id)
      await processFollowerDistributionChunk(distribution.distribution_id)
    }
    const request = createRequest()
    await request.authenticateAs(user)

    expect(await readHackerNewsFilteredItemIds(request, 'follow_users')).toEqual([
      [seen.id],
      [seen.id],
      [seen.id],
      [plain.id],
      [plain.id],
      [plain.id],
    ])
  })

  it('ignores the filter when Hacker News visibility is off', async () => {
    const { user, feedId, seen, plain } = await createHackerNewsFeedFilterFixture()
    await followRssFeed(user, feedId)
    const request = createRequest()
    await request.authenticateAs(user)
    const restore = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: false,
    })
    try {
      const response = await request
        .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds')
        .query({ has_hacker_news_references: 'true', time_range: 'all' })
        .expect(200)
      expect(
        response.body.results.map((row: { entity_id: string }) => row.entity_id).toSorted(),
      ).toEqual([seen.id, plain.id].toSorted())
    } finally {
      restore()
    }
  })

  it('rejects an invalid Hacker News filter value', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds')
      .query({ has_hacker_news_references: 'maybe' })
      .expect(422)
  })
})
