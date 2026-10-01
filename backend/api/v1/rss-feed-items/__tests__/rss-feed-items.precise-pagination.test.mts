import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  followRssFeed,
} from '@voucha/test-helpers'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'

describe('RSS opaque precise cursor routes', () => {
  it('traverses recency and feed pages and rejects cross-resource and filter replay', async () => {
    const user = await createTestUser()
    const feedId = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(user, feedId)
    const items = await upsertRssFeedItems(
      feedId,
      [456, 456, 455].map(microseconds => {
        const guid = randomUUID()
        return {
          guid,
          link: `https://example.com/${guid}`,
          title: 'Route publication',
          isoDate: `2020-01-02T03:04:05.123${microseconds}Z`,
        }
      }),
    )
    const expected = [items[0].id, items[1].id].toSorted().reverse().concat(items[2].id)
    const request = createRequest()
    await request.authenticateAs(user)
    const searchPath = '/api/v1/rss-feed-items'
    const feedPath = '/api/v1/feeds/rss_feed_items/follow_rss_feeds'
    const firstCursors: string[] = []
    const opaqueCursor = expect.any(String)
    for (const [path, filters] of [
      [searchPath, { rss_feeds: feedId }],
      [feedPath, { time_range: 'all' }],
    ] as const) {
      const seen: string[] = []
      let after: string | undefined
      for (let page = 0; page < 4; page++) {
        const response = await request
          .get(path)
          .query({ ...filters, limit: '1', ...(after ? { after } : {}) })
          .expect(200)
        seen.push(...response.body.results.map((item: { id: string }) => item.id))
        expect(response.body.page_info.start_cursor).toEqual(expect.any(String))
        expect(response.body.page_info.end_cursor).toEqual(
          response.body.page_info.has_next_page ? opaqueCursor : null,
        )
        if (page === 0) firstCursors.push(response.body.page_info.end_cursor)
        if (!response.body.page_info.has_next_page) {
          break
        }
        after = response.body.page_info.end_cursor
      }
      expect(seen).toEqual(expected)
    }
    await request
      .get(searchPath)
      .query({ rss_feeds: feedId, after: firstCursors[0], media_type: 'audio' })
      .expect(400)
    await request.get(feedPath).query({ time_range: 'all', after: firstCursors[0] }).expect(400)
    await request.get(searchPath).query({ rss_feeds: feedId, after: firstCursors[1] }).expect(400)
    await request
      .get(searchPath)
      .query({
        rss_feeds: feedId,
        after: firstCursors[0],
        semantic_search_query: `cursor-order-${randomUUID()}`,
      })
      .expect(400)
  })
})
