import { it, expect, beforeAll, describe } from 'vitest'
import { deleteOldCrawlChunks, finalizeChunksIfComplete } from '@services/crawl-chunks/cleanup'
import {
  createTestUser,
  insertTestCrawlChunk,
  countCrawlChunks,
  getCrawlChunks,
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
  it('deleteOldCrawlChunks deletes chunks from old crawls', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/delete-old-chunks-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    // Create old crawl with chunks
    const oldCrawl = await createCrawl(url!.id, crawler.id)
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: oldCrawl.id,
      orderIndex: 0,
      markdown: 'Old chunk',
      contentSha256: sha256('Old chunk'),
    })

    // Create new crawl with chunks
    const newCrawl = await createCrawl(url!.id, crawler.id)

    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: newCrawl.id,
      orderIndex: 0,
      markdown: 'New chunk',
      contentSha256: sha256('New chunk'),
    })

    // Verify both chunks exist
    const beforeDeleteCount = await countCrawlChunks({ urlId: url!.id })
    expect(beforeDeleteCount).toBe(2)

    // Delete old chunks
    await deleteOldCrawlChunks(url!.id, newCrawl.id)

    // Verify only new chunk remains
    const afterDeleteChunks = (await getCrawlChunks(url!.id, newCrawl.id)) as Array<{
      crawl_id: string
      markdown: string
    }>
    expect(afterDeleteChunks).toHaveLength(1)
    expect(afterDeleteChunks[0].crawl_id).toBe(newCrawl.id)
    expect(afterDeleteChunks[0].markdown).toBe('New chunk')
  })

  it('deleteOldCrawlChunks does nothing when only current crawl exists', async () => {
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
    })

    // Delete old chunks (should not affect current chunk)
    await deleteOldCrawlChunks(url!.id, crawl.id)

    // Verify chunk still exists
    const afterDeleteCount = await countCrawlChunks({ urlId: url!.id, crawlId: crawl.id })
    expect(afterDeleteCount).toBe(1)
  })

  it('finalizeChunksIfComplete returns false when embeddings are pending', async () => {
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

    const result = await finalizeChunksIfComplete(url!.id, crawl.id)
    expect(result).toBe(false)

    // Verify embeddings_generated_at is still NULL
    const embeddingsGeneratedAt = await getCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)
    expect(embeddingsGeneratedAt).toBeNull()
  })

  it('finalizeChunksIfComplete returns true and finalizes when all embeddings are complete', async () => {
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

    const result = await finalizeChunksIfComplete(url!.id, newCrawl.id)
    expect(result).toBe(true)

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

  it('finalizeChunksIfComplete does not update embeddings_generated_at if already set', async () => {
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

    const result = await finalizeChunksIfComplete(url!.id, crawl.id)
    expect(result).toBe(true)

    // Verify embeddings_generated_at is still the old date
    const embeddingsGeneratedAt = await getCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)
    expect(new Date(embeddingsGeneratedAt!).toISOString()).toBe(fixedDate.toISOString())
  })
})
