import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import searchCrawlsSemanticTool from './search-crawls-semantic.mts'
import { addUrl } from '@services/urls'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { insertTestCrawlChunk } from '@voucha/test-helpers/entities/crawl-chunks-insert'
import {
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'

describe('search-crawls-semantic.generated', () => {
  it('searchCrawlsSemanticTool has correct schema', () => {
    expect(searchCrawlsSemanticTool.schema).toBeDefined()
    expect(searchCrawlsSemanticTool.schema.type).toBe('function')
    expect(searchCrawlsSemanticTool.schema.name).toBe('search_crawls_semantic')
    expect(searchCrawlsSemanticTool.schema.description).toContain('semantic similarity')
    expect(
      (searchCrawlsSemanticTool.schema.parameters as { required?: string[] })?.required,
    ).toContain('query')
  })

  it('returns results and clamps limits', { timeout: 30_000 }, async () => {
    const query = `semantic crawl search ${crypto.randomUUID()}`
    const queryEmbedding = makeRandomEmbedding()
    await seedSearchEmbeddingCache(query, queryEmbedding)

    const user = await createTestUser()
    const url = await addUrl(null, `https://crawl-search-${crypto.randomUUID()}.example.com/search`)
    if (!url) throw new Error('Failed to create test URL')
    const crawl = await insertTestCrawl({
      urlId: url.id,
      statusCode: 200,
      markdown: 'Semantic crawl test content',
    })

    for (const index of Array.from({ length: 12 }, (_, value) => value)) {
      const markdown = `Semantic crawl chunk ${query} ${index}`
      await insertTestCrawlChunk({
        urlId: url.id,
        crawlId: crawl.id,
        orderIndex: index,
        markdown,
        contentSha256: createHash('sha256').update(markdown).digest(),
        embedding: makeNearbyEmbedding(queryEmbedding),
        tokens: 10,
      })
    }

    const executor = searchCrawlsSemanticTool.function(user)

    const defaultLimitResult = await executor({ query })
    expect(defaultLimitResult.success).toBe(true)
    expect(defaultLimitResult.results).toHaveLength(5)

    const clampedResult = await executor({ query, limit: 100 })
    expect(clampedResult.success).toBe(true)
    expect(clampedResult.results).toHaveLength(10)
  })
})
