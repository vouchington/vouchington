import { createHash, randomInt, randomUUID } from 'node:crypto'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestTopic,
  createTestUser,
  createTestRssFeedWithTiming,
  insertTestRssFeedItem,
  insertHackerNewsReferencesForTest,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import { backendResponseContracts } from '../../../test-helpers/api-fixtures/response-contracts.mts'
import { validateResponseContract } from '../../../test-helpers/api-fixtures/contract-schema.mts'
import { describe, expect, it } from 'vitest'

describe('Hacker News RSS item fixture contract', () => {
  it('returns list counts and detail references for the item URL', async () => {
    const feedId = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const viewer = await createTestUser()
    const guid = randomUUID()
    const url = await addUrl(null, `https://example.com/${guid}`, { content_type: 'text/html' })
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: url!.id,
      guid,
      itemData: { title: guid },
      contentSha256: createHash('sha256').update(guid).digest(),
    })
    const storyId = randomInt(1_000_000_000, 2_000_000_000)
    const commentId = storyId + 1
    await insertHackerNewsReferencesForTest({
      url_id: url!.id,
      story_count: 1,
      comment_count: 1,
      stories: [
        {
          hacker_news_item_id: storyId,
          points: 7,
          reply_count: 3,
          posted_at: '2026-11-01T00:00:00Z',
        },
      ],
      comments: [
        {
          hacker_news_item_id: commentId,
          parent_story_item_id: storyId,
          posted_at: '2026-11-01T01:00:00Z',
        },
      ],
    })
    const request = createRequest()
    await request.authenticateAs(viewer)
    const list = await request
      .get('/api/v1/rss-feed-items')
      .query({ rss_feed: feedId, limit: 25 })
      .expect(200)
    expect(
      validateResponseContract(
        backendResponseContracts['GET:/api/v1/rss-feed-items']!.schema,
        list.body,
      ),
    ).toEqual([])
    expect(list.body.results.some((row: { id: string }) => row.id === itemId)).toBe(true)
    expect(list.body.rss_feed_item_hacker_news_references[itemId]).toEqual({
      story_count: 1,
      comment_count: 1,
    })

    const detail = await request.get(`/api/v1/rss-feed-items/${itemId}`).expect(200)
    expect(
      validateResponseContract(
        backendResponseContracts['GET:/api/v1/rss-feed-items/:id']!.schema,
        detail.body,
      ),
    ).toEqual([])
    expect(detail.body.rss_feed_item_hacker_news_references[itemId]).toMatchObject({
      story_count: 1,
      comment_count: 1,
      stories: [expect.objectContaining({ hacker_news_item_id: storyId })],
      comments: [expect.objectContaining({ hacker_news_item_id: commentId })],
    })
  })
})
