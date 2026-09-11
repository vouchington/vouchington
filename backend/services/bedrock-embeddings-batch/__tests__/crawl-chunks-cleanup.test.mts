import { it, expect, describe } from 'vitest'
import { finalizeChunksIfComplete, deleteOldCrawlChunks } from '@services/crawl-chunks/cleanup'
import {
  createTestCrawlWithChunks,
  crawlHasPendingEmbeddings,
  getCrawlEmbeddingsGeneratedAt,
  getAllCrawlChunksForUrl,
  countCrawlChunks,
  getCrawlChunksGroupedByCrawl,
  type TestCrawlWithChunks,
} from '@voucha/test-helpers'
import { applyCrawlChunkBatchUpdates } from '../entities/crawl-chunks.mts'
import { createCrawlChunkEntityId } from '../entities/crawl-chunk-entity-id.mts'

describe('cleanup', () => {
  it('finalizeChunksIfComplete returns false when chunks are still pending', async () => {
    const uniqueText = `Test incomplete ${Date.now()} ${Math.random()}`
    const { url, crawl } = (await createTestCrawlWithChunks({
      markdown: uniqueText,
    })) as TestCrawlWithChunks
    // Should return false because chunks don't have embeddings yet
    const result = await finalizeChunksIfComplete(url!.id, crawl.id)
    expect(result).toBe(false)

    // Verify crawl still has pending embeddings
    const hasPendingEmbeddings = await crawlHasPendingEmbeddings(url!.id, crawl.id)
    const embeddingsGeneratedAt = await getCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)

    expect(hasPendingEmbeddings).toBe(true)
    expect(embeddingsGeneratedAt).toBeNull()
  })

  it('finalizeChunksIfComplete returns true and updates crawl when all chunks complete', async () => {
    const uniqueText = `Test complete ${Date.now()} ${Math.random()}`
    const { url, crawl } = (await createTestCrawlWithChunks({
      markdown: uniqueText,
    })) as TestCrawlWithChunks
    // Get all chunks for this crawl
    const chunks = (await getAllCrawlChunksForUrl(url!.id)) as Array<{
      crawl_id: string
      order_index: number
      bedrock_nova_multimodal_v1_content_sha256: Buffer
    }>

    // Apply embeddings to all chunks
    const updates = chunks.map(chunk => ({
      entity_id: createCrawlChunkEntityId(chunk.crawl_id, chunk.order_index),
      content_sha256: chunk.bedrock_nova_multimodal_v1_content_sha256,
      embedding: new Array(1024).fill(0).map((_, i) => i / 1024),
      input_token_count: null,
    }))

    await applyCrawlChunkBatchUpdates(updates)

    // Now finalize should succeed
    const result = await finalizeChunksIfComplete(url!.id, crawl.id)
    expect(result).toBe(true)

    // Verify crawl has been finalized
    const hasPendingEmbeddings = await crawlHasPendingEmbeddings(url!.id, crawl.id)
    const embeddingsGeneratedAt = await getCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)

    expect(hasPendingEmbeddings).toBe(false)
    expect(embeddingsGeneratedAt).not.toBeNull()
  })

  it('deleteOldCrawlChunks removes chunks from previous crawls', async () => {
    const uniqueText1 = `Test old crawl ${Date.now()} ${Math.random()}`
    const uniqueText2 = `Test new crawl ${Date.now() + 1} ${Math.random()}`

    // Create first crawl
    const crawl1 = (await createTestCrawlWithChunks({
      markdown: uniqueText1,
    })) as TestCrawlWithChunks
    // Create second crawl for the same URL
    await createTestCrawlWithChunks({ markdown: uniqueText2 })
    // Count chunks before deletion
    const beforeCount = await countCrawlChunks({ urlId: crawl1.url!.id })
    expect(beforeCount).toBeGreaterThan(0)

    // Delete old chunks (keeping crawl1)
    await deleteOldCrawlChunks(crawl1.url!.id, crawl1.crawl.id)

    // Verify only crawl1's chunks remain
    const afterGroups = await getCrawlChunksGroupedByCrawl(crawl1.url!.id)

    // Should only have chunks for crawl1
    expect(afterGroups).toHaveLength(1)
    expect(afterGroups[0].crawl_id).toBe(crawl1.crawl.id)
  })
})
