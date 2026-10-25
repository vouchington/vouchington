import { it, expect, describe } from 'vitest'
import { finalizeChunksIfCompleteForMany } from '@services/crawl-chunks/cleanup'
import {
  createTestCrawlWithChunks,
  insertTestCrawlPending,
  crawlHasPendingEmbeddings,
  getCrawlEmbeddingsGeneratedAt,
  getAllCrawlChunksForUrl,
  countCrawlChunks,
  type TestCrawlWithChunks,
} from '@voucha/test-helpers'
import { applyCrawlChunkBatchUpdates } from '../entities/crawl-chunks.mts'
import { createCrawlChunkEntityId } from '../entities/crawl-chunk-entity-id.mts'

describe('cleanup', () => {
  it('does not finalize while chunks are still pending', async () => {
    const uniqueText = `Test incomplete ${Date.now()} ${Math.random()}`
    const { url, crawl } = (await createTestCrawlWithChunks({
      markdown: uniqueText,
    })) as TestCrawlWithChunks
    await finalizeChunksIfCompleteForMany([crawl.id])

    // Verify crawl still has pending embeddings
    const hasPendingEmbeddings = await crawlHasPendingEmbeddings(url!.id, crawl.id)
    const embeddingsGeneratedAt = await getCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)

    expect(hasPendingEmbeddings).toBe(true)
    expect(embeddingsGeneratedAt).toBeNull()
  })

  it('updates the crawl when all chunks complete', async () => {
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

    await finalizeChunksIfCompleteForMany([crawl.id])

    // Verify crawl has been finalized
    const hasPendingEmbeddings = await crawlHasPendingEmbeddings(url!.id, crawl.id)
    const embeddingsGeneratedAt = await getCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)

    expect(hasPendingEmbeddings).toBe(false)
    expect(embeddingsGeneratedAt).not.toBeNull()
  })

  it('clears the pending marker of superseded crawls', async () => {
    const older = (await createTestCrawlWithChunks({
      markdown: `Test superseded ${Date.now()} ${Math.random()}`,
    })) as TestCrawlWithChunks
    const urlId = older.url!.id
    const newer = await insertTestCrawlPending(urlId, older.crawler.id)

    await finalizeChunksIfCompleteForMany([newer.id])

    expect(await crawlHasPendingEmbeddings(urlId, older.crawl.id)).toBe(false)
    expect(await countCrawlChunks({ urlId })).toBe(0)
  })
})
