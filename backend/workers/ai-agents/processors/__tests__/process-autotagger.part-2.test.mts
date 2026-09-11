import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { insertTestRssFeedItem } from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { addUrl } from '@services/urls/upsert'
import type { Job } from 'glide-mq'
import type { AutotaggerRssFeedItemJobData } from '@queues/ai-agents/types'
import type { runAutotaggerOnRssFeedItem } from '@agents/autotagger'
import type { enqueueAutotaggerRssFeedItem } from '@queues/ai-agents/enqueues/autotagger'
import { processAutotaggerRssFeedItem } from '../process-autotagger.mts'

// Post worker tests live in process-autotagger.test.mts (split to stay under the per-file line
// cap). Note: kill-switch, discoverability gating, tiered max_topics, and the collaborative-topic
// pass for RSS feed items are NOT exercised here -- that logic lives inside
// runAutotaggerOnRssFeedItem (@agents/autotagger/run-rss-feed-item.mts), which this file mocks.
// Those behaviors are covered in agents/autotagger/run-rss-feed-item.test.mts instead.

const mockRunAutotaggerOnRssFeedItem = vi.fn<typeof runAutotaggerOnRssFeedItem>()
const mockEnqueueAutotaggerRssFeedItem = vi.fn<typeof enqueueAutotaggerRssFeedItem>()

function mockRssItemJob(data: AutotaggerRssFeedItemJobData): Job<AutotaggerRssFeedItemJobData> {
  return {
    data,
    name: 'autotagger-rss-feed-item',
    id: randomUUID(),
  } as Job<AutotaggerRssFeedItemJobData>
}

function autotaggerDependencies() {
  return {
    enqueueAutotaggerRssFeedItem: mockEnqueueAutotaggerRssFeedItem,
    runAutotaggerOnRssFeedItem: mockRunAutotaggerOnRssFeedItem,
  }
}

let rssFeedId: string

describe('processAutotaggerRssFeedItem', () => {
  beforeAll(async () => {
    const feed = await createTestRssFeed({})
    rssFeedId = feed.id
  }, 30_000)

  it('returns null when RSS feed item does not exist', async () => {
    mockRunAutotaggerOnRssFeedItem.mockClear()
    const result = await processAutotaggerRssFeedItem(
      mockRssItemJob({ rss_feed_item_id: randomUUID() }),
      autotaggerDependencies(),
    )
    expect(result).toBeNull()
    expect(mockRunAutotaggerOnRssFeedItem).not.toHaveBeenCalled()
  })

  it('re-enqueues with incremented retries (default 0 → 1) when embedding is missing', async () => {
    mockEnqueueAutotaggerRssFeedItem.mockClear()
    const suffix = randomUUID().slice(0, 8)
    const url = await addUrl(null, `https://autotagger-test-no-embed-${suffix}.example.com`)
    const itemId = await insertTestRssFeedItem({
      rssFeedId,
      urlId: url!.id,
      guid: `no-embed-${suffix}`,
      itemData: { title: 'No embedding item', guid: `no-embed-${suffix}` },
      contentSha256: Buffer.alloc(32),
    })
    const result = await processAutotaggerRssFeedItem(
      mockRssItemJob({ rss_feed_item_id: itemId }),
      autotaggerDependencies(),
    )
    expect(mockEnqueueAutotaggerRssFeedItem).toHaveBeenCalledWith(itemId, 1)
    expect(result).toBeNull()
  })

  it('re-enqueues with incremented retries (5 → 6) when embedding is missing', async () => {
    mockEnqueueAutotaggerRssFeedItem.mockClear()
    const suffix = randomUUID().slice(0, 8)
    const url = await addUrl(null, `https://autotagger-test-retry5-${suffix}.example.com`)
    const itemId = await insertTestRssFeedItem({
      rssFeedId,
      urlId: url!.id,
      guid: `retry5-${suffix}`,
      itemData: { title: 'Retry item', guid: `retry5-${suffix}` },
      contentSha256: Buffer.alloc(32),
    })
    const result = await processAutotaggerRssFeedItem(
      mockRssItemJob({ rss_feed_item_id: itemId, embedding_retries: 5 }),
      autotaggerDependencies(),
    )
    expect(mockEnqueueAutotaggerRssFeedItem).toHaveBeenCalledWith(itemId, 6)
    expect(result).toBeNull()
  })

  it('throws after 10 retries when embedding still missing', async () => {
    mockEnqueueAutotaggerRssFeedItem.mockClear()
    const suffix = randomUUID().slice(0, 8)
    const url = await addUrl(null, `https://autotagger-test-maxretry-${suffix}.example.com`)
    const itemId = await insertTestRssFeedItem({
      rssFeedId,
      urlId: url!.id,
      guid: `maxretry-${suffix}`,
      itemData: { title: 'Max retry item', guid: `maxretry-${suffix}` },
      contentSha256: Buffer.alloc(32),
    })
    await expect(
      processAutotaggerRssFeedItem(
        mockRssItemJob({ rss_feed_item_id: itemId, embedding_retries: 10 }),
        autotaggerDependencies(),
      ),
    ).rejects.toThrow('Embeddings never generated')
  })

  it('calls runAutotaggerOnRssFeedItem when embedding exists', async () => {
    mockRunAutotaggerOnRssFeedItem.mockClear()
    mockRunAutotaggerOnRssFeedItem.mockResolvedValue({ tagged: true } as never)
    const suffix = randomUUID().slice(0, 8)
    const url = await addUrl(null, `https://autotagger-test-embed-${suffix}.example.com`)
    const embedding = Array.from({ length: 1024 }, () => Math.random() - 0.5)
    const norm = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0))
    const unitEmbedding = embedding.map(x => x / norm)
    const itemId = await insertTestRssFeedItem({
      rssFeedId,
      urlId: url!.id,
      guid: `with-embed-${suffix}`,
      itemData: { title: 'Item with embedding', guid: `with-embed-${suffix}` },
      contentSha256: Buffer.alloc(32),
      embedding: unitEmbedding,
      tokens: 10,
    })
    const result = await processAutotaggerRssFeedItem(
      mockRssItemJob({ rss_feed_item_id: itemId }),
      autotaggerDependencies(),
    )
    expect(mockRunAutotaggerOnRssFeedItem).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ tagged: true })
  })
})
