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

    expect(retrieved).toMatchObject({
      __entity_type: 'crawl',
      id: crawl.id,
      created_at: crawl.created_at,
      response_status_code: crawl.response_status_code,
      completed_at: crawl.completed_at,
      title: crawl.title,
      language: crawl.language,
    })
    expect(Object.keys(retrieved ?? {}).toSorted()).toEqual(
      [
        '__entity_type',
        'completed_at',
        'created_at',
        'id',
        'language',
        'response_status_code',
        'title',
      ].toSorted(),
    )
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

  it('rejects an unscoped cursor for public and privileged URL crawl histories', async () => {
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
    await expect(
      searchPublicUrlCrawlsForUrl(url!.id, {
        after: encodeCursor({ id: firstCrawlId }),
        limit: 1,
      }),
    ).rejects.toMatchObject({ status: 400 })

    const privilegedFirstPage = await searchCrawlsForUrl(url!.id, { limit: 1 })
    const privilegedFirstCrawlId = privilegedFirstPage.results[0]!.id
    await expect(
      searchCrawlsForUrl(url!.id, {
        after: encodeCursor({ id: privilegedFirstCrawlId }),
        limit: 1,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a malformed URL crawl cursor', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createTestUser()
    const url = await addUrl(user!.id, `https://search-crawl-malformed-${random}.example.com/page`)

    await expect(
      searchPublicUrlCrawlsForUrl(url!.id, { after: 'not-a-cursor' }),
    ).rejects.toMatchObject({ message: 'Invalid URL crawl cursor', status: 400 })
  })
})
