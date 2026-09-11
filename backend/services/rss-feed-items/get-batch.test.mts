import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  setRssFeedItemMediaType,
} from '@voucha/test-helpers'
import { filterRssFeedItemIdsByMediaType, getRssFeedItemsByIdBatch } from './get-batch.mts'

describe('get-batch', () => {
  it('getRssFeedItemsByIdBatch returns empty array for empty input', async () => {
    const results = await getRssFeedItemsByIdBatch([])
    expect(results).toEqual([])
  })

  it('getRssFeedItemsByIdBatch returns null for non-existent items while preserving order', async () => {
    const results = await getRssFeedItemsByIdBatch([randomUUID(), randomUUID()])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]).toBeNull()
  })

  it('getRssFeedItemsByIdBatch throws for invalid IDs', async () => {
    await expect(getRssFeedItemsByIdBatch(['invalid-id'])).rejects.toThrow(
      'Invalid RSS feed item ID: invalid-id',
    )
  })
})

describe('filterRssFeedItemIdsByMediaType', () => {
  it('returns an empty set for an empty id list without querying', async () => {
    await expect(filterRssFeedItemIdsByMediaType([], 'article')).resolves.toEqual(new Set())
  })

  it('rejects an invalid RSS feed item id', async () => {
    await expect(filterRssFeedItemIdsByMediaType(['not-a-uuid'], 'article')).rejects.toThrow(
      'Invalid RSS feed item ID: not-a-uuid',
    )
  })

  it('keeps only non-deleted ids that match media_type', async () => {
    const topic = await createTestTopic({
      name: `RSS media probe ${crypto.randomUUID()}`,
      slug: `rss-media-probe-${crypto.randomUUID()}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const article = await createTestRssFeedItemWithUrl(feedId)
    const audio = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(article.id, 'article')
    await setRssFeedItemMediaType(audio.id, 'audio')

    await expect(
      filterRssFeedItemIdsByMediaType([article.id, audio.id], 'article'),
    ).resolves.toEqual(new Set([article.id]))
  })
})
