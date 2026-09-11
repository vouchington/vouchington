import { describe, it, expect, beforeAll } from 'vitest'
import { searchCrawlChunks } from './search.mts'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { insertTestCrawlChunksBulk } from '@voucha/test-helpers/entities/crawl-chunks'
import { addUrl } from '@services/urls'

describe('searchCrawlChunks', () => {
  let testUrlId: string
  let testCrawlId: string
  beforeAll(async () => {
    // Create test URL
    const url = await addUrl(null, `https://example-${crypto.randomUUID()}.com/test-search`)
    if (!url) throw new Error('Failed to create test URL')
    testUrlId = url.id
    // Create test crawl — let PostgreSQL generate a UUIDv7 so it lands in the current partition
    const crawl = await insertTestCrawl({
      urlId: testUrlId,
      statusCode: 200,
      markdown: 'Test content',
    })
    testCrawlId = crawl.id

    // Create test crawl chunks
    await insertTestCrawlChunksBulk([
      {
        urlId: testUrlId,
        crawlId: testCrawlId,
        orderIndex: 0,
        markdown: 'This is about credit cards and rewards programs',
        contentSha256: '0000000000000000000000000000000000000000000000000000000000000000',
      },
      {
        urlId: testUrlId,
        crawlId: testCrawlId,
        orderIndex: 1,
        markdown: 'Information about travel hacking and points',
        contentSha256: '0000000000000000000000000000000000000000000000000000000000000001',
      },
      {
        urlId: testUrlId,
        crawlId: testCrawlId,
        orderIndex: 2,
        markdown: 'Guide to maximizing airline miles',
        contentSha256: '0000000000000000000000000000000000000000000000000000000000000002',
      },
      {
        urlId: testUrlId,
        crawlId: testCrawlId,
        orderIndex: 3,
        markdown: 'Completely unrelated content about gardening',
        contentSha256: '0000000000000000000000000000000000000000000000000000000000000003',
      },
    ])
  })
  it('should find relevant crawl chunks by text search', async () => {
    const results = await searchCrawlChunks('credit cards', 10)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toHaveProperty('url_id')
    expect(results[0]).toHaveProperty('crawl_id')
    expect(results[0]).toHaveProperty('markdown')
    expect(results[0]?.markdown).toContain('credit cards')
  })

  it('should return results ordered by relevance', async () => {
    const results = await searchCrawlChunks('credit cards rewards', 10)

    expect(results.length).toBeGreaterThan(0)
    // First result should be most relevant (contains both terms)
    expect(results[0]?.markdown).toContain('credit cards')
    expect(results[0]?.markdown).toContain('rewards')
  })

  it('should respect the limit parameter', async () => {
    const results = await searchCrawlChunks('travel', 2)

    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('should return empty array when no matches found', async () => {
    const results = await searchCrawlChunks('nonexistentterm12345', 10)

    expect(results).toEqual([])
  })

  it('should handle queries with special characters', async () => {
    const results = await searchCrawlChunks('credit & cards', 10)

    expect(Array.isArray(results)).toBe(true)
  })

  it('should find results with partial word matches using websearch syntax', async () => {
    const results = await searchCrawlChunks('mile', 10)

    expect(results.length).toBeGreaterThan(0)
    expect(results.some(r => r.markdown.toLowerCase().includes('mile'))).toBe(true)
  })
})
