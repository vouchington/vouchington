import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { makeRandomEmbedding } from '@voucha/test-helpers'
import { insertTestCentralizedEmbeddingsBulk } from '@voucha/test-helpers/entities/_bedrock-embeddings-support'
import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { upsertRssFeedItemEmbedding } from './rss-feed-items.mts'

describe('upsertRssFeedItemEmbedding', () => {
  it('embeds the item from the centralized cache when no current embedding exists', async () => {
    const data = {
      link: `https://example.com/items/${randomUUID()}`,
      guid: randomUUID(),
      title: `Bedrock rss item processor ${randomUUID()}`,
      description: 'Feed item body reusing a centralized cached embedding.',
    }
    const { content_sha256 } = createRssFeedItemEmbeddingContent(data)
    await insertTestCentralizedEmbeddingsBulk([
      { content_sha256, embedding: makeRandomEmbedding(), input_token_count: 5 },
    ])

    const result = await upsertRssFeedItemEmbedding({ id: randomUUID(), data } as ViewRssFeedItem)

    expect(result.content_sha256.equals(content_sha256)).toBe(true)
  })
})
