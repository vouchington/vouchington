import { beforeAll, describe, it, expect } from 'vitest'
import searchCrawlChunksTool from './search-crawl-chunks.mts'
import { addUrl } from '@services/urls'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { insertTestCrawlChunksBulk } from '@voucha/test-helpers/entities/crawl-chunks'

describe('search-crawl-chunks tool', () => {
  let query: string

  beforeAll(async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    query = `credit cards crawl chunks ${suffix}`
    const url = await addUrl(null, `https://crawl-chunks-${suffix}.example.com/test-search`)
    if (!url) throw new Error('Failed to create test URL')
    const crawl = await insertTestCrawl({
      urlId: url.id,
      statusCode: 200,
      markdown: 'Test content',
    })
    await insertTestCrawlChunksBulk(
      Array.from({ length: 12 }, (_, index) => ({
        urlId: url.id,
        crawlId: crawl.id,
        orderIndex: index,
        markdown: `Chunk ${index} about ${query}`,
        contentSha256: index.toString(16).padStart(64, '0'),
      })),
    )
  })

  it('has correct schema name', () => {
    expect(searchCrawlChunksTool.schema.name).toBe('search_crawl_chunks')
  })

  it('returns success with results from real searchCrawlChunks', async () => {
    const executor = searchCrawlChunksTool.function(null as never)
    const result = await executor({ query })

    expect(result.success).toBe(true)
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0].markdown).toContain(query)
  })

  it('clamps limit to max 10', async () => {
    const executor = searchCrawlChunksTool.function(null as never)
    const result = await executor({ query, limit: 100 })

    expect(result.results).toHaveLength(10)
  })

  it('uses default limit of 5 when not provided', async () => {
    const executor = searchCrawlChunksTool.function(null as never)
    const result = await executor({ query })

    expect(result.results).toHaveLength(5)
  })
})
