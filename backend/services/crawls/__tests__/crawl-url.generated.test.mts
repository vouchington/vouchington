import { it, expect, beforeAll, beforeEach, describe, vi } from 'vitest'
import { crawlUrl } from '../crawl-url.mts'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { createTestUser, countCrawlsForUrl, updateUrlHostnameBlocked } from '@voucha/test-helpers'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { CrawlerNetworkError } from '@modules/on-error/errors'
import type { PrivateUser } from '@services/users/types'

const fetchCrawlerHtml = vi.fn<VitestLooseMock>()
const isUrlCrawlable = vi.fn<VitestLooseMock>().mockResolvedValue(true)
const resolveDnsCanary = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
const resolveSafeCrawlerAddresses = vi
  .fn<VitestLooseMock>()
  .mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

function crawlUrlForTest(...args: Parameters<typeof crawlUrl>) {
  const [urlId, hopCount = 0, visitedUrls = new Set<string>(), options] = args
  return crawlUrl(urlId, hopCount, visitedUrls, {
    ...options,
    dependencies: {
      fetchCrawlerHtml,
      isUrlCrawlable,
      resolveDnsCanary,
      resolveSafeCrawlerAddresses,
      ...options?.dependencies,
    },
  })
}

describe('crawl-url.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('crawlUrl returns null when hostname is blocked', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `blocked-${random}.example.com`
    const url = await addUrl(user.id, `https://${hostname}/test`)
    await updateUrlHostnameBlocked(url!.hostname.id, true)

    const result = await crawlUrlForTest(url!.id)
    expect(result).toBeNull()
  })

  it('crawlUrl returns null when hostname is not crawlable', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `not-crawlable-${random}.example.com`
    const url = await addUrl(user.id, `https://${hostname}/test`)
    await updateUrlHostname(url!.hostname.id, { crawlable: false })

    const result = await crawlUrlForTest(url!.id)
    expect(result).toBeNull()
  })

  it('crawlUrl throws CrawlerNetworkError for unreachable hostnames', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `no-crawler-${random}.invalid`
    const url = await addUrl(user.id, `https://${hostname}/test`)
    await updateUrlHostname(url!.hostname.id, { crawlable: true })
    await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })

    resolveSafeCrawlerAddresses.mockRejectedValueOnce(
      new CrawlerNetworkError(`https://${hostname}/test`, 0, new Error('getaddrinfo ENOTFOUND')),
    )

    await expect(crawlUrlForTest(url!.id)).rejects.toBeInstanceOf(CrawlerNetworkError)
  })

  it('crawlUrl returns null for a missing URL id leftover after a reset', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000'
    await expect(crawlUrlForTest(fakeUuid)).resolves.toBeNull()
  })

  it('crawlUrl does not create crawl record when hostname is blocked', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `blocked-crawl-${random}.example.com`
    const url = await addUrl(user.id, `https://${hostname}/test`)
    await updateUrlHostnameBlocked(url!.hostname.id, true)

    const result = await crawlUrlForTest(url!.id)
    expect(result).toBeNull()

    const crawlCount = await countCrawlsForUrl(url!.id)
    expect(crawlCount).toBe(0)
  })
})
