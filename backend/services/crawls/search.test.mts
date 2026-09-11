import { it, expect, describe } from 'vitest'
import { encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { searchCrawlsForUrl, searchPublicUrlCrawlsForUrl } from './search.mts'
import { createCrawl } from './create.mts'
import { updateCrawl } from './update.mts'
import { addUrl } from '@services/urls'
import { createCrawler } from '@services/crawlers'
import { createTestUser } from '@voucha/test-helpers'

describe('search', () => {
  it('projects embed metadata in privileged crawl history', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createTestUser()
    const url = await addUrl(user!.id, `https://search-crawl-embed-${random}.example.com/page`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const embedMetadata = {
      kind: 'article' as const,
      requestedUrl: url!.url,
      resolvedUrl: url!.url,
      title: 'Projected embed',
      description: null,
      author: null,
      provider: null,
      thumbnail: null,
      player: null,
    }
    await updateCrawl(crawl.id, url!.id, { embed_metadata: embedMetadata })

    const result = await searchCrawlsForUrl(url!.id)

    expect(result.results.find(row => row.id === crawl.id)?.embed_metadata).toEqual(embedMetadata)
  })

  it('searchCrawlsForUrl uses the shared limit clamp', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createTestUser()
    const url = await addUrl(user!.id, `https://search-crawl-limit-${random}.example.com/page`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })

    for (let index = 0; index < 101; index++) {
      await createCrawl(url!.id, crawler.id)
    }

    const minLimited = await searchCrawlsForUrl(url!.id, { limit: 0 })
    expect(minLimited.results).toHaveLength(1)

    const defaultLimited = await searchCrawlsForUrl(url!.id, { limit: undefined })
    expect(defaultLimited.results).toHaveLength(50)

    const maxLimited = await searchCrawlsForUrl(url!.id, { limit: 500 })
    expect(maxLimited.results).toHaveLength(100)
  })

  it('searchPublicUrlCrawlsForUrl does not materialize privileged crawl fields', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createTestUser()
    const url = await addUrl(user!.id, `https://search-crawl-public-${random}.example.com/page`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)

    const result = await searchPublicUrlCrawlsForUrl(url!.id)
    const retrieved = result.results.find(result => result.id === crawl.id)

    expect(retrieved).toMatchObject({ id: crawl.id })
    expect(retrieved).not.toHaveProperty('request_headers')
    expect(retrieved).not.toHaveProperty('response_headers')
    expect(retrieved).not.toHaveProperty('markdown')
    expect(retrieved).not.toHaveProperty('links')
    expect(retrieved).not.toHaveProperty('meta_tags')
  })

  it('rejects a paid crawl cursor issued for a different URL', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createTestUser()
    const firstUrl = await addUrl(user!.id, `https://search-crawl-first-${random}.example.com/page`)
    const secondUrl = await addUrl(
      user!.id,
      `https://search-crawl-second-${random}.example.com/page`,
    )
    const crawler = await createCrawler(user!, {
      hostname_id: firstUrl!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(firstUrl!.id, crawler.id)

    await expect(
      searchPublicUrlCrawlsForUrl(secondUrl!.id, {
        after: encodeScopedUuidCursor(crawl.id, `url:${firstUrl!.id}:crawls`),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('continues public and privileged URL crawl histories with a legacy unscoped cursor', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createTestUser()
    const url = await addUrl(user!.id, `https://search-crawl-legacy-${random}.example.com/page`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    await createCrawl(url!.id, crawler.id)
    await createCrawl(url!.id, crawler.id)

    const firstPage = await searchPublicUrlCrawlsForUrl(url!.id, { limit: 1 })
    const firstCrawlId = firstPage.results[0]!.id
    const continuation = await searchPublicUrlCrawlsForUrl(url!.id, {
      after: encodeCursor({ id: firstCrawlId }),
      limit: 1,
    })

    expect(continuation.results).toHaveLength(1)
    expect(continuation.results[0]!.id).not.toBe(firstCrawlId)

    const privilegedFirstPage = await searchCrawlsForUrl(url!.id, { limit: 1 })
    const privilegedFirstCrawlId = privilegedFirstPage.results[0]!.id
    const privilegedContinuation = await searchCrawlsForUrl(url!.id, {
      after: encodeCursor({ id: privilegedFirstCrawlId }),
      limit: 1,
    })

    expect(privilegedContinuation.results).toHaveLength(1)
    expect(privilegedContinuation.results[0]!.id).not.toBe(privilegedFirstCrawlId)
  })

  it('keeps a legacy URL crawl cursor structurally bound to the queried URL', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createTestUser()
    const targetUrl = await addUrl(
      user!.id,
      `https://search-crawl-target-${random}.example.com/page`,
    )
    const foreignUrl = await addUrl(
      user!.id,
      `https://search-crawl-foreign-${random}.example.com/page`,
    )
    const targetCrawler = await createCrawler(user!, {
      hostname_id: targetUrl!.hostname.id,
      crawler_type: 'fetch',
    })
    const foreignCrawler = await createCrawler(user!, {
      hostname_id: foreignUrl!.hostname.id,
      crawler_type: 'fetch',
    })
    const firstTargetCrawl = await createCrawl(targetUrl!.id, targetCrawler.id)
    const secondTargetCrawl = await createCrawl(targetUrl!.id, targetCrawler.id)
    const foreignCrawl = await createCrawl(foreignUrl!.id, foreignCrawler.id)

    const result = await searchPublicUrlCrawlsForUrl(targetUrl!.id, {
      after: encodeCursor({ id: foreignCrawl.id }),
    })
    const resultIds = result.results.map(crawl => crawl.id)

    expect(resultIds).toEqual(expect.arrayContaining([firstTargetCrawl.id, secondTargetCrawl.id]))
    expect(resultIds).not.toContain(foreignCrawl.id)
  })

  it('rejects a malformed legacy URL crawl cursor', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createTestUser()
    const url = await addUrl(user!.id, `https://search-crawl-malformed-${random}.example.com/page`)

    await expect(
      searchPublicUrlCrawlsForUrl(url!.id, { after: 'not-a-cursor' }),
    ).rejects.toMatchObject({ message: 'Invalid URL crawl cursor', status: 400 })
  })
})
