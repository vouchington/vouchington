import { it, expect, describe } from 'vitest'
import { createTestTopic, createTestUser, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { createRssFeed } from './create.mts'
import { softDeleteRssFeedById } from './delete.mts'
import { filterRssFeedIdsByFeedType, getRssFeedsByIdBatch } from './get-batch.mts'

describe('get-batch', () => {
  it('getRssFeedsByIdBatch returns empty array for empty input', async () => {
    const results = await getRssFeedsByIdBatch([])
    expect(results).toEqual([])
  })

  it('getRssFeedsByIdBatch fetches multiple RSS feeds by IDs in correct order', async () => {
    await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topics = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        createTestTopic({
          slug: `test-topic-${index}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          name: `Test Topic for RSS ${index + 1} ${random}`,
          hostname: `get-batch-${index}-${Date.now()}.example.com`,
        }),
      ),
    )
    const feed1 = await createRssFeed({
      skipRemoteValidation: true,
      topic_id: topics[0].id,
      title: 'Test Feed 1',
      rss_feed_url: `https://example.com/feed1-${Date.now()}.xml`,
    })
    const feed2 = await createRssFeed({
      skipRemoteValidation: true,
      topic_id: topics[1].id,
      title: 'Test Feed 2',
      rss_feed_url: `https://example.com/feed2-${Date.now()}.xml`,
    })
    const feed3 = await createRssFeed({
      skipRemoteValidation: true,
      topic_id: topics[2].id,
      title: 'Test Feed 3',
      rss_feed_url: `https://example.com/feed3-${Date.now()}.xml`,
    })
    // Fetch in specific order
    const results = await getRssFeedsByIdBatch([feed2.id, feed1.id, feed3.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(feed2.id)
    expect(results[1]?.id).toBe(feed1.id)
    expect(results[2]?.id).toBe(feed3.id)
  })

  it('getRssFeedsByIdBatch returns null for non-existent feeds while preserving order', async () => {
    await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      slug: `test-topic-order-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      name: `Test Topic Order ${random}`,
      hostname: `order-${Date.now()}.example.com`,
    })
    const feed = await createRssFeed({
      skipRemoteValidation: true,
      topic_id: topic.id,
      title: 'Test Feed Order',
      rss_feed_url: `https://example.com/order-${Date.now()}.xml`,
    })
    const results = await getRssFeedsByIdBatch(['00000000-0000-0000-0000-000000000001', feed.id])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]?.id).toBe(feed.id)
  })

  it('getRssFeedsByIdBatch throws for invalid IDs', async () => {
    await expect(getRssFeedsByIdBatch(['invalid-id'])).rejects.toThrow('Invalid RSS feed ID')
  })
})

describe('filterRssFeedIdsByFeedType', () => {
  it('returns an empty set for an empty id list without querying', async () => {
    await expect(filterRssFeedIdsByFeedType([], 'article')).resolves.toEqual(new Set())
  })

  it('rejects an invalid RSS feed id', async () => {
    await expect(filterRssFeedIdsByFeedType(['not-a-uuid'], 'article')).rejects.toThrow(
      'Invalid RSS feed ID: not-a-uuid',
    )
  })

  it('keeps only live ids that match feed_type', async () => {
    const article = await insertTestRssFeedDirect({ feedType: 'article' })
    const podcast = await insertTestRssFeedDirect({ feedType: 'podcast' })
    const deletedArticle = await insertTestRssFeedDirect({ feedType: 'article' })
    await softDeleteRssFeedById(deletedArticle.id)

    await expect(
      filterRssFeedIdsByFeedType([article.id, podcast.id, deletedArticle.id], 'article'),
    ).resolves.toEqual(new Set([article.id]))
  })
})
