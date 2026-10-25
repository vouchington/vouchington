import { it, expect, beforeAll, describe } from 'vitest'
import { finalizeChunksIfCompleteForMany } from '@services/crawl-chunks/cleanup'
import {
  createTestUser,
  insertTestCrawlChunk,
  countCrawlChunks,
  getCrawlEmbeddingsGeneratedAt,
  updateCrawlEmbeddingsGeneratedAt,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from '../create.mts'
import { sha256 } from '@modules/utils'
import { makeRandomEmbedding } from '@voucha/test-helpers/entities/embeddings'
import type { PrivateUser } from '@services/users/types'

// Lives in @services/crawls (not @services/crawl-chunks) because it exercises
// createCrawl fixtures: crawl-chunks must not depend back on @services/crawls
// (that would create a @services/crawl-chunks <-> @services/crawls workspace
// cycle), but crawls already depends on crawl-chunks for real.
describe('cleanup.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('finalizing the only crawl retains its current chunk', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/delete-no-old-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown: 'Current chunk',
      contentSha256: sha256('Current chunk'),
      embedding: makeRandomEmbedding(),
      tokens: 100,
    })

    await finalizeChunksIfCompleteForMany([crawl.id])

    // Verify chunk still exists
    const afterDeleteCount = await countCrawlChunks({ urlId: url!.id, crawlId: crawl.id })
    expect(afterDeleteCount).toBe(1)
    expect(await getCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)).not.toBeNull()
  })

  it('does not finalize when embeddings are pending', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/finalize-pending-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    // Create chunk without embedding
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown: 'Chunk without embedding',
      contentSha256: sha256('Chunk without embedding'),
    })

    await finalizeChunksIfCompleteForMany([crawl.id])

    // Verify embeddings_generated_at is still NULL
    const embeddingsGeneratedAt = await getCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)
    expect(embeddingsGeneratedAt).toBeNull()
  })

  it('finalizes when all embeddings are complete', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/finalize-complete-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const oldCrawl = await createCrawl(url!.id, crawler.id)
    // Create old chunk
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: oldCrawl.id,
      orderIndex: 0,
      markdown: 'Old chunk',
      contentSha256: sha256('Old chunk'),
      embedding: makeRandomEmbedding(),
      tokens: 100,
    })

    const newCrawl = await createCrawl(url!.id, crawler.id)

    // Create new chunk with embedding
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: newCrawl.id,
      orderIndex: 0,
      markdown: 'New chunk with embedding',
      contentSha256: sha256('New chunk with embedding'),
      embedding: makeRandomEmbedding(),
      tokens: 100,
    })

    await finalizeChunksIfCompleteForMany([newCrawl.id])

    // Verify embeddings_generated_at is set
    const embeddingsGeneratedAt = await getCrawlEmbeddingsGeneratedAt(url!.id, newCrawl.id)
    expect(embeddingsGeneratedAt).not.toBeNull()

    // Verify old chunks are deleted
    const oldChunksCount = await countCrawlChunks({ urlId: url!.id, crawlId: oldCrawl.id })
    expect(oldChunksCount).toBe(0)

    // Verify new chunk still exists
    const newChunksCount = await countCrawlChunks({ urlId: url!.id, crawlId: newCrawl.id })
    expect(newChunksCount).toBe(1)
  })

  it('preserves an existing embeddings_generated_at timestamp', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/finalize-already-set-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    // Set embeddings_generated_at manually
    const fixedDate = new Date('2025-01-01T00:00:00Z')
    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, fixedDate)

    // Create chunk with embedding
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown: 'Chunk',
      contentSha256: sha256('Chunk'),
      embedding: makeRandomEmbedding(),
      tokens: 100,
    })

    await finalizeChunksIfCompleteForMany([crawl.id])

    // Verify embeddings_generated_at is still the old date
    const embeddingsGeneratedAt = await getCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)
    expect(new Date(embeddingsGeneratedAt!).toISOString()).toBe(fixedDate.toISOString())
  })
})
