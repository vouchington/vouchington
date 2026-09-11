import { it, expect, beforeAll, describe } from 'vitest'
import { createCrawlChunks } from '@services/crawl-chunks/create'
import {
  createTestUser,
  getCrawlData,
  getAllCrawlChunksForUrl,
  crawlHasPendingEmbeddings,
  getCrawlChunksWithEmbeddingStatus,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from '../create.mts'
import { updateCrawl } from '../update.mts'
import type { PrivateUser } from '@services/users/types'

// Lives in @services/crawls (not @services/crawl-chunks) because it exercises
// createCrawl/updateCrawl fixtures: crawl-chunks must not depend back on
// @services/crawls (that would create a @services/crawl-chunks <-> @services/crawls
// workspace cycle), but crawls already depends on crawl-chunks for real.
describe('create.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('createCrawlChunks skips when markdown is null', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/no-markdown-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const result = await createCrawlChunks({
      ...crawl,
      markdown: null as any,
    })

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('content_too_short')
  })

  it('createCrawlChunks skips when markdown is too short', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/short-markdown-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await updateCrawl(crawl.id, url!.id, {
      markdown: 'ab', // Only 2 characters
    })

    const updatedCrawl = await getCrawlData(url!.id, crawl.id)

    const result = await createCrawlChunks(updatedCrawl as any)

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('content_too_short')
  })

  it('createCrawlChunks creates chunks for valid markdown', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/valid-markdown-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const markdown = `# Test Article

  This is a test article with sufficient content to be chunked.
  It contains multiple paragraphs and should generate at least one chunk.

  ## Section 1

  Some content in section 1 that provides meaningful information.

  ## Section 2

  More content in section 2 to ensure we have enough text.`

    await updateCrawl(crawl.id, url!.id, {
      markdown,
    })

    const updatedCrawl = await getCrawlData(url!.id, crawl.id)

    const result = await createCrawlChunks(updatedCrawl as any)

    expect(result.skipped).toBeUndefined()
    expect(result.chunks_created).toBeGreaterThan(0)

    // Verify chunks were created in database
    const chunks = (await getAllCrawlChunksForUrl(url!.id)) as Array<{
      markdown: string
      bedrock_nova_multimodal_v1_content_sha256: Buffer
    }>

    expect(chunks.length).toBe(result.chunks_created)
    expect(chunks[0].markdown).toBeTruthy()
    expect(chunks[0].bedrock_nova_multimodal_v1_content_sha256).toBeTruthy()
  })

  it('createCrawlChunks sets has_pending_embeddings when embeddings are not cached', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/pending-embeddings-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const markdown = `# Unique Content ${random}

  This is unique content that won't have cached embeddings.
  It should set has_pending_embeddings to true.`

    await updateCrawl(crawl.id, url!.id, {
      markdown,
    })

    const updatedCrawl = await getCrawlData(url!.id, crawl.id)

    await createCrawlChunks(updatedCrawl as any)

    // Verify has_pending_embeddings is true
    const hasPendingEmbeddings = await crawlHasPendingEmbeddings(url!.id, crawl.id)
    expect(hasPendingEmbeddings).toBe(true)

    // Verify chunks have null embeddings
    const chunks = (await getCrawlChunksWithEmbeddingStatus(url!.id, crawl.id)) as Array<{
      bedrock_nova_multimodal_v1_embedding: unknown | null
      bedrock_nova_multimodal_v1_embedding_created_at: Date | null
    }>

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0].bedrock_nova_multimodal_v1_embedding).toBeNull()
    expect(chunks[0].bedrock_nova_multimodal_v1_embedding_created_at).toBeNull()
  })

  it('createCrawlChunks handles markdown with title in meta_tags', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/with-title-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const markdown = `Test content with title`
    await updateCrawl(crawl.id, url!.id, {
      markdown,
      meta_tags: { title: 'Test Page Title' },
    })

    const updatedCrawl = await getCrawlData(url!.id, crawl.id)

    const result = await createCrawlChunks(updatedCrawl as any)

    expect(result.skipped).toBeUndefined()
    expect(result.chunks_created).toBeGreaterThan(0)
  })
})
