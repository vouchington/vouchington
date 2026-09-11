import { getMinUUIDv7ForDate, isUUID } from '@modules/utils'
import {
  createCrawlChunksBaseQueryForTest,
  createCrawlChunksCreatedAtOrderForTest,
  createCrawlChunksMarkdownConditionForTest,
} from '@voucha/test-helpers'
import { it, expect, vi, afterEach, describe } from 'vitest'
import { buildValidCrawlChunksFilter } from '../filters.mts'

describe('filters', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns valid SQL statement', () => {
    const filter = buildValidCrawlChunksFilter()

    expect(filter).toBeDefined()
    expect(filter.sql).toBeDefined()
    expect(filter.values).toBeDefined()
  })

  it('includes all required JOINs', () => {
    const filter = buildValidCrawlChunksFilter()
    const sqlText = filter.sql

    // Verify all required JOINs are present
    expect(sqlText).toContain('JOIN crawls ON crawls.id = crawl_chunks.crawl_id')
    expect(sqlText).toContain('JOIN urls ON urls.id = crawls.url_id')
    expect(sqlText).toContain('JOIN url_hostnames ON url_hostnames.id = urls.hostname_id')
  })

  it('includes all required WHERE conditions', () => {
    const filter = buildValidCrawlChunksFilter()
    const sqlText = filter.sql

    // Verify all filtering conditions are present
    expect(sqlText).toContain('WHERE url_hostnames.blocked = false')
    expect(sqlText).toContain('url_hostnames.crawlable = true')
    expect(sqlText).toContain('crawls.embeddings_generated_at IS NOT NULL')
    expect(sqlText).toContain('crawls.response_status_code = 200')
    expect(sqlText).toContain('crawls.completed_at IS NOT NULL')
    expect(sqlText).toContain('crawls.network_error IS NULL')
    expect(sqlText).toContain('crawls.id >=')
  })

  it('uses a UUIDv7 cutoff parameter for recent-crawl filtering (not created_at)', () => {
    const now = new Date('2026-02-22T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const filter = buildValidCrawlChunksFilter()
    const sqlText = filter.sql
    const expectedCutoff = getMinUUIDv7ForDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))

    expect(sqlText).toContain('crawls.id >= ?')
    expect(sqlText).not.toContain('crawls.created_at')
    expect(filter.values).toHaveLength(2)
    expect(typeof filter.values[0]).toBe('string')
    expect(isUUID(filter.values[0] as string)).toBe(true)
    expect(filter.values[0]).toBe(expectedCutoff)
  })

  it('applies the same UUIDv7 cutoff to the crawl_chunks partition key', () => {
    const filter = buildValidCrawlChunksFilter()

    expect(filter.sql).toContain('crawls.id >= ?')
    expect(filter.sql).toContain('crawl_chunks.crawl_id >= ?')
    expect(filter.values).toHaveLength(2)
    expect(filter.values[1]).toBe(filter.values[0])
  })

  it('can be appended to other SQL queries', () => {
    const baseQuery = createCrawlChunksBaseQueryForTest()
    const filter = buildValidCrawlChunksFilter()

    baseQuery.append(filter)

    expect(baseQuery.sql).toContain('SELECT * FROM crawl_chunks')
    expect(baseQuery.sql).toContain('JOIN crawls')
    expect(baseQuery.sql).toContain('WHERE url_hostnames.blocked = false')
  })

  it('can have additional conditions appended after it', () => {
    const query = createCrawlChunksBaseQueryForTest()
    const filter = buildValidCrawlChunksFilter()

    query.append(filter)
    query.append(createCrawlChunksMarkdownConditionForTest())
    query.append(createCrawlChunksCreatedAtOrderForTest())

    expect(query.sql).toContain('WHERE url_hostnames.blocked = false')
    expect(query.sql).toContain('AND crawl_chunks.markdown IS NOT NULL')
    expect(query.sql).toContain('ORDER BY crawl_chunks.created_at DESC')
  })
})
