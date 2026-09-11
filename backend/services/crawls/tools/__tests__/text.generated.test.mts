import { it, expect, beforeAll, describe } from 'vitest'
import { toolsSearchCrawls } from '../text.mts'
import {
  createTestUser,
  insertTestCrawlChunk,
  updateUrlHostnameBlocked,
  updateCrawlEmbeddingsGeneratedAt,
  markCrawlAsCompletedForSearch,
  setHostnameAsValidForCrawlSearch,
  updateUrlHostnameCrawlable,
  setCrawlNetworkError,
  setCrawlStatusCode,
  clearCrawlCompletedAt,
  clearCrawlEmbeddingsGeneratedAt,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from '@services/crawls/create'
import { sha256 } from '@modules/utils'
import type { PrivateUser } from '@services/users/types'

describe('text.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns valid chunks from valid crawls', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/valid-${random}`)
    // Set hostname as crawlable and not blocked (both default to NULL)
    await setHostnameAsValidForCrawlSearch(url!.hostname.id)

    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    // Mark crawl as completed with valid status
    await markCrawlAsCompletedForSearch(url!.id, crawl.id)

    // Add embeddings timestamp
    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, new Date())

    // Create a chunk with unique searchable content
    const uniqueId = `unique${random}test`
    const markdown = `This is a test chunk with ${uniqueId} content for searching`
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
    })

    // search_vector is automatically generated from markdown, no need to update

    const results = await toolsSearchCrawls({ query: uniqueId })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].url_id).toBe(url!.id)
    expect(results[0].crawl_id).toBe(crawl.id)
    expect(results[0].markdown).toContain(uniqueId)
  })

  it('filters out chunks from blocked hostnames', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const timestamp = Date.now()
    // Create URL with unique hostname to avoid conflicts
    const url = await addUrl(user.id, `https://blocked-${timestamp}-${random}.com/test`)
    // Now block the hostname after the URL is created
    await updateUrlHostnameBlocked(url!.hostname.id, true)

    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    // Mark crawl as completed with valid status
    await markCrawlAsCompletedForSearch(url!.id, crawl.id)

    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, new Date())

    const markdown = 'This is blocked content that should not appear'
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
    })

    const results = await toolsSearchCrawls({ query: 'blocked' })

    // Should not find the blocked content
    expect(results.find(r => r.url_id === url!.id)).toBeUndefined()
  })

  it('filters out chunks from non-crawlable hostnames', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://noncrawlable.com/test-${random}`)
    // Mark hostname as not crawlable
    await updateUrlHostnameCrawlable(url!.hostname.id, false)

    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await markCrawlAsCompletedForSearch(url!.id, crawl.id)

    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, new Date())

    const markdown = 'This is non-crawlable content'
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
    })

    const results = await toolsSearchCrawls({ query: 'crawlable' })

    expect(results.find(r => r.url_id === url!.id)).toBeUndefined()
  })

  // NOTE: Testing old crawls (>30 days) is not possible because created_at is a
  // VIRTUAL GENERATED column derived from the UUIDv7 timestamp. To test this properly,
  // we would need to create a crawl with an old UUIDv7, which is complex and not
  // worth the effort for this edge case.

  it('filters out crawls with network errors', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://networkerror.com/test-${random}`)
    // Set hostname as valid for crawl search
    await setHostnameAsValidForCrawlSearch(url!.hostname.id)

    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    // Set network error
    await setCrawlNetworkError(url!.id, crawl.id, 'timeout')

    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, new Date())

    const markdown = 'This crawl had a network error'
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
    })

    const results = await toolsSearchCrawls({ query: 'network' })

    expect(results.find(r => r.url_id === url!.id)).toBeUndefined()
  })

  it('filters out incomplete crawls (no embeddings_generated_at)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://incomplete.com/test-${random}`)
    // Set hostname as valid for crawl search
    await setHostnameAsValidForCrawlSearch(url!.hostname.id)

    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await clearCrawlEmbeddingsGeneratedAt(url!.id, crawl.id)

    const markdown = 'This crawl has no embeddings yet'
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
    })

    const results = await toolsSearchCrawls({ query: 'embeddings' })

    expect(results.find(r => r.url_id === url!.id)).toBeUndefined()
  })

  it('filters out crawls with non-200 HTTP status', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://error404.com/test-${random}`)
    // Set hostname as valid for crawl search
    await setHostnameAsValidForCrawlSearch(url!.hostname.id)

    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await setCrawlStatusCode(url!.id, crawl.id, 404)

    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, new Date())

    const markdown = 'This page returned a 404 error'
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
    })

    const results = await toolsSearchCrawls({ query: 'error' })

    expect(results.find(r => r.url_id === url!.id)).toBeUndefined()
  })

  it('filters out crawls without completed_at timestamp', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://notcompleted.com/test-${random}`)
    // Set hostname as valid for crawl search
    await setHostnameAsValidForCrawlSearch(url!.hostname.id)

    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await clearCrawlCompletedAt(url!.id, crawl.id)

    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, new Date())

    const markdown = 'This crawl was never completed'
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
    })

    const results = await toolsSearchCrawls({ query: 'completed' })

    expect(results.find(r => r.url_id === url!.id)).toBeUndefined()
  })
})
