import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUrlWithHostname,
  createTestUser,
  insertHackerNewsReferencesForTest,
  insertRecentlyViewedRssFeedItem,
  insertTestRssFeedItem,
  insertUserSavedRssFeedItem,
  safeUsername,
} from '@voucha/test-helpers'

describe('GET /api/v1/users/:idOrSlug/rss-feed-items/:listType Hacker News sidecar', () => {
  it('returns Hacker News counts by item id for saved and viewed lists', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-hn-list') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS HN list ${owner.id}`,
      slug: `rss-hn-list-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const [seenUrl, plainUrl] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const [seen, plain] = await Promise.all(
      [seenUrl, plainUrl].map((urlId, index) =>
        insertTestRssFeedItem({
          rssFeedId: feedId,
          urlId,
          guid: `hn-list-${owner.id}-${index}`,
          itemData: { title: `HN list item ${index}` },
          contentSha256: createHash('sha256').update(`hn-list-${owner.id}-${index}`).digest(),
        }),
      ),
    )
    await insertHackerNewsReferencesForTest({ url_id: seenUrl, story_count: 2, comment_count: 1 })
    await Promise.all([
      insertUserSavedRssFeedItem(owner.id, seen),
      insertUserSavedRssFeedItem(owner.id, plain),
      insertRecentlyViewedRssFeedItem(owner.id, seen),
    ])

    const request = createRequest()
    await request.authenticateAs(owner)
    const expected = { [seen]: { story_count: 2, comment_count: 1 } }
    const saved = await request.get(`/api/v1/users/${owner.id}/rss-feed-items/saved`).expect(200)
    expect(saved.body.rss_feed_item_hacker_news_references).toEqual(expected)
    const viewed = await request.get(`/api/v1/users/${owner.id}/rss-feed-items/viewed`).expect(200)
    expect(viewed.body.rss_feed_item_hacker_news_references).toEqual(expected)
  })
})
