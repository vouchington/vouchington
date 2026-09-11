import { describe, it, expect } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { searchWeb } from './search.mts'
import {
  insertTestUrlHostname,
  insertTestUrl,
  insertTestCrawl,
  insertTestCrawlChunksBulk,
} from '@voucha/test-helpers'

function sha256hex(): string {
  return randomBytes(32).toString('hex')
}

describe('searchWeb', () => {
  it('returns content match with snippet containing sentinel markers', async () => {
    const token = randomUUID().replace(/-/g, '')
    const hostnameId = await insertTestUrlHostname({
      hostname: `web-search-${randomUUID()}.com`,
      crawlable: true,
    })
    const urlId = await insertTestUrl({
      url: `https://web-search-${randomUUID()}.com/${token}`,
      hostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: `The sentinel token ${token} appears in this crawled content for FTS testing`,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId,
        crawlId,
        orderIndex: 0,
        markdown: `The sentinel token ${token} appears in this crawled content for FTS testing`,
        contentSha256: sha256hex(),
      },
    ])

    const result = await searchWeb({ query: token, limit: 10 })

    const match = result.results.find(r => r.url.id === urlId)
    expect(match).toBeDefined()
    expect(match!.match_type).toBe('content')
    expect(match!.snippet).toContain('⟦MARK⟧')
  })

  it('returns url-only match with snippet null and match_type url', async () => {
    const token = randomUUID().replace(/-/g, '')
    const hostnameId = await insertTestUrlHostname({
      hostname: `web-search-url-${randomUUID()}.com`,
      crawlable: true,
    })
    const urlId = await insertTestUrl({
      url: `https://web-search-url-${randomUUID()}.com/path/${token}/page`,
      hostnameId,
    })

    const result = await searchWeb({ query: token, limit: 10 })

    const match = result.results.find(r => r.url.id === urlId)
    expect(match).toBeDefined()
    expect(match!.match_type).toBe('url')
    expect(match!.snippet).toBeNull()
  })

  it('content results rank before url-string results', async () => {
    const token = randomUUID().replace(/-/g, '')
    const contentHostnameId = await insertTestUrlHostname({
      hostname: `web-search-rank-content-${randomUUID()}.com`,
      crawlable: true,
    })
    const contentUrlId = await insertTestUrl({
      url: `https://web-search-rank-content-${randomUUID()}.com/page`,
      hostnameId: contentHostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId: contentUrlId,
      statusCode: 200,
      markdown: `Ranking test token ${token} in crawled content`,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId: contentUrlId,
        crawlId,
        orderIndex: 0,
        markdown: `Ranking test token ${token} in crawled content`,
        contentSha256: sha256hex(),
      },
    ])

    const urlHostnameId = await insertTestUrlHostname({
      hostname: `web-search-rank-url-${randomUUID()}.com`,
      crawlable: true,
    })
    await insertTestUrl({
      url: `https://web-search-rank-url-${randomUUID()}.com/${token}/only-url`,
      hostnameId: urlHostnameId,
    })

    const result = await searchWeb({ query: token, limit: 25 })

    const contentIdx = result.results.findIndex(r => r.url.id === contentUrlId)
    const firstUrlIdx = result.results.findIndex(r => r.match_type === 'url')

    expect(contentIdx).toBeGreaterThanOrEqual(0)
    // There must be a url match, and it must come after the content match
    expect(firstUrlIdx).toBeGreaterThan(contentIdx)
  })

  it('blocked hostname is excluded from content and url branches', async () => {
    const token = randomUUID().replace(/-/g, '')
    const blockedHostnameId = await insertTestUrlHostname({
      hostname: `web-search-blocked-${randomUUID()}.com`,
      crawlable: true,
      blocked: true,
    })
    const urlId = await insertTestUrl({
      url: `https://web-search-blocked-${randomUUID()}.com/${token}/page`,
      hostnameId: blockedHostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: `Blocked hostname ${token} content`,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId,
        crawlId,
        orderIndex: 0,
        markdown: `Blocked hostname ${token} content`,
        contentSha256: sha256hex(),
      },
    ])

    const result = await searchWeb({ query: token, limit: 25 })

    expect(result.results.find(r => r.url.id === urlId)).toBeUndefined()
  })

  it('excludes crawl for non-crawlable hostname from content results', async () => {
    const token = randomUUID().replace(/-/g, '')
    const hostnameId = await insertTestUrlHostname({
      hostname: `web-search-nocrawl-${randomUUID()}.com`,
      crawlable: false,
    })
    const urlId = await insertTestUrl({
      url: `https://web-search-nocrawl-${randomUUID()}.com/${token}/page`,
      hostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: `Non-crawlable ${token} content`,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId,
        crawlId,
        orderIndex: 0,
        markdown: `Non-crawlable ${token} content`,
        contentSha256: sha256hex(),
      },
    ])

    const result = await searchWeb({ query: token, limit: 25 })

    const match = result.results.find(r => r.url.id === urlId)
    expect(match?.match_type).not.toBe('content')
  })

  it('dedup: url matching both branches appears once with the snippet', async () => {
    const token = randomUUID().replace(/-/g, '')
    const hostnameId = await insertTestUrlHostname({
      hostname: `web-search-dedup-${randomUUID()}.com`,
      crawlable: true,
    })
    const urlId = await insertTestUrl({
      url: `https://web-search-dedup-${randomUUID()}.com/${token}/path`,
      hostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: `Dedup test ${token} in markdown content`,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId,
        crawlId,
        orderIndex: 0,
        markdown: `Dedup test ${token} in markdown content`,
        contentSha256: sha256hex(),
      },
    ])

    const result = await searchWeb({ query: token, limit: 25 })

    const matches = result.results.filter(r => r.url.id === urlId)
    expect(matches).toHaveLength(1)
    expect(matches[0].match_type).toBe('content')
    expect(matches[0].snippet).toContain('⟦MARK⟧')
  })

  it('short query (<3 chars) throws 400', async () => {
    await expect(searchWeb({ query: 'ab' })).rejects.toThrow(
      'Web search query must be at least 3 characters',
    )
  })

  it('pure-negative query returns empty results (no all-rows match)', async () => {
    const result = await searchWeb({ query: '-zzzzzzzunlikelyterm' })
    expect(result.results).toHaveLength(0)
  })

  it('page_info.has_next_page is always false', async () => {
    const token = randomUUID().replace(/-/g, '')
    const hostnameId = await insertTestUrlHostname({
      hostname: `web-search-pageinfo-${randomUUID()}.com`,
      crawlable: true,
    })
    await insertTestUrl({
      url: `https://web-search-pageinfo-${randomUUID()}.com/${token}/page`,
      hostnameId,
    })

    const result = await searchWeb({ query: token, limit: 10 })

    expect(result.page_info.has_next_page).toBe(false)
  })
})
