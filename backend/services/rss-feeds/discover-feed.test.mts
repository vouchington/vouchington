import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCrawl,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import {
  createPendingRssFeedImportDiscoveryForTest,
  getRssFeedImportDiscoveriesForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import type { CrawlerHtmlStructuredObject } from '@services/crawls/types'
import { completeRssFeedImportDiscovery } from './discover-feed.mts'

type DiscoveryCase = {
  name: string
  links: (baseUrl: string) => CrawlerHtmlStructuredObject | null
  expected: (baseUrl: string) => string | null
}

const cases: DiscoveryCase[] = [
  {
    name: 'finds an RSS alternate',
    links: () => ({ alternate: { 'application/rss+xml': ['/feed.xml'] } }),
    expected: baseUrl => new URL('/feed.xml', baseUrl).href,
  },
  {
    name: 'preserves an absolute href',
    links: () => ({ alternate: { 'application/rss+xml': ['https://other.example.com/rss'] } }),
    expected: () => 'https://other.example.com/rss',
  },
  {
    name: 'finds an Atom alternate',
    links: () => ({ alternate: { 'application/atom+xml': ['/atom.xml'] } }),
    expected: baseUrl => new URL('/atom.xml', baseUrl).href,
  },
  {
    name: 'finds a JSON Feed alternate',
    links: () => ({ alternate: { 'application/feed+json': ['/feed.json'] } }),
    expected: baseUrl => new URL('/feed.json', baseUrl).href,
  },
  {
    name: 'finds an application/json alternate',
    links: () => ({ alternate: { 'application/json': ['/feed.json'] } }),
    expected: baseUrl => new URL('/feed.json', baseUrl).href,
  },
  {
    name: 'prefers RSS over Atom',
    links: () => ({
      alternate: { 'application/atom+xml': ['/atom.xml'], 'application/rss+xml': ['/rss.xml'] },
    }),
    expected: baseUrl => new URL('/rss.xml', baseUrl).href,
  },
  {
    name: 'prefers Atom over JSON Feed',
    links: () => ({
      alternate: { 'application/feed+json': ['/feed.json'], 'application/atom+xml': ['/atom.xml'] },
    }),
    expected: baseUrl => new URL('/atom.xml', baseUrl).href,
  },
  {
    name: 'accepts a scalar href',
    links: () => ({ alternate: { 'application/rss+xml': '/feed.xml' } }),
    expected: baseUrl => new URL('/feed.xml', baseUrl).href,
  },
  {
    name: 'matches MIME type keys without case',
    links: () => ({ alternate: { 'Application/RSS+XML': ['/feed.xml'] } }),
    expected: baseUrl => new URL('/feed.xml', baseUrl).href,
  },
  {
    name: 'skips a non-public URL before a public candidate',
    links: () => ({
      alternate: { 'application/rss+xml': ['http://localhost/feed.xml', '/feed.xml'] },
    }),
    expected: baseUrl => new URL('/feed.xml', baseUrl).href,
  },
  {
    name: 'finds no alternate among canonical links',
    links: baseUrl => ({ canonical: baseUrl }),
    expected: () => null,
  },
  {
    name: 'rejects a self link',
    links: baseUrl => ({ alternate: { 'application/rss+xml': [baseUrl] } }),
    expected: () => null,
  },
  {
    name: 'handles malformed crawler links',
    links: () => ({ alternate: ['not-an-object'] }),
    expected: () => null,
  },
  {
    name: 'handles absent crawler links',
    links: () => null,
    expected: () => null,
  },
]

describe('RSS feed discovery from stored HTML crawls', () => {
  it.each(cases)('$name', async ({ links, expected }) => {
    const currentUser = await createTestUser()
    const hostname = `discover-links-${randomUUID()}.example.com`
    const pageUrl = `https://${hostname}/`
    const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
    const pageUrlId = await insertTestUrl({ hostnameId, url: pageUrl })
    const { rowId, generation } = await createPendingRssFeedImportDiscoveryForTest(
      currentUser.id,
      pageUrl,
      pageUrlId,
    )
    const crawlLinks = links(pageUrl)
    const crawl = await insertTestCrawl({
      urlId: pageUrlId,
      statusCode: 200,
      markdown: 'Feed discovery page',
      ...(crawlLinks ? { links: crawlLinks } : {}),
    })

    await completeRssFeedImportDiscovery(rowId, pageUrlId, generation, {
      url_id: pageUrlId,
      crawl_id: crawl.id,
      response_status_code: 200,
    })

    const [discovery] = await getRssFeedImportDiscoveriesForTest(rowId)
    expect(discovery?.discovered_feed_url).toBe(expected(pageUrl))
    expect(discovery?.failed_at instanceof Date).toBe(expected(pageUrl) === null)
  })
})
