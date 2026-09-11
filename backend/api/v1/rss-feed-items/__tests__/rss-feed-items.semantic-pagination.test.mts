import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  addDummyEmbeddingToRssFeedItem,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  insertTestStory,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
  setTestItemStoryId,
} from '@voucha/test-helpers'

describe('GET /api/v1/rss-feed-items semantic pagination', () => {
  it('traverses scoped relevance pages and returns page-local story sidecars', async () => {
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const query = `semantic-page-${crypto.randomUUID()}`
    const queryEmbedding = makeRandomEmbedding()
    await seedSearchEmbeddingCache(query, queryEmbedding)

    const items = await Promise.all(
      Array.from({ length: 5 }, () => createTestRssFeedItemWithUrl(feedId)),
    )
    await Promise.all(
      items.map(item =>
        addDummyEmbeddingToRssFeedItem(item.id, {
          embedding: makeNearbyEmbedding(queryEmbedding),
        }),
      ),
    )
    const story = await insertTestStory()
    await setTestItemStoryId(items[0].id, story.id)
    await setTestItemStoryId(items[1].id, story.id)

    const request = createRequest()
    const page1 = await request
      .get('/api/v1/rss-feed-items')
      .query({ rss_feeds: feedId, semantic_search_query: query, limit: '2' })
      .expect(200)
    const page2 = await request
      .get('/api/v1/rss-feed-items')
      .query({
        rss_feeds: feedId,
        semantic_search_query: query,
        limit: '2',
        after: page1.body.page_info.end_cursor,
      })
      .expect(200)

    const firstIds = page1.body.results.map((result: { id: string }) => result.id)
    const secondIds = page2.body.results.map((result: { id: string }) => result.id)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(new Set([...firstIds, ...secondIds])).toHaveLength(firstIds.length + secondIds.length)
    expect(
      [...firstIds, ...secondIds].filter(id => [items[0].id, items[1].id].includes(id)),
    ).toHaveLength(1)

    const pageResults = [page1, page2].map(
      page => page.body.results as Array<{ id: string; story_id: string | null }>,
    )
    for (const [index, results] of pageResults.entries()) {
      const page = [page1, page2][index]
      const otherPage = [page1, page2][1 - index]
      for (const result of results) expect(page.body.rss_feed_items[result.id]).toBeDefined()
      for (const result of otherPage.body.results as Array<{ id: string }>) {
        expect(page.body.rss_feed_items[result.id]).toBeUndefined()
      }
    }
    const storyResult = pageResults.flat().find(result => result.story_id === story.id)
    if (!storyResult) throw new Error('Expected a semantic result for the seeded story')
    const storyPage = [page1, page2].find(page => page.body.rss_feed_items[storyResult.id])
    if (!storyPage) throw new Error('Expected the story result to have item sidecars')
    expect(storyPage.body.story_member_ids[story.id]).toEqual(
      expect.arrayContaining([items[0].id, items[1].id]),
    )

    await request
      .get('/api/v1/rss-feed-items')
      .query({
        rss_feeds: feedId,
        semantic_search_query: `${query}-different`,
        limit: '2',
        after: page1.body.page_info.end_cursor,
      })
      .expect(400)
  })
})
