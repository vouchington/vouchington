import { beforeAll, beforeEach, vi } from 'vitest'
import { crawlUrl } from '../../../services/crawls/crawl-url.mts'
import type { CrawlerHtmlResult } from '../../../services/crawler-html/types.mts'
import { createTestUser } from '../../entities/users.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

type CrawlUrlRedirectMock = ReturnType<typeof vi.fn<VitestLooseMock>>

export type CrawlUrlRedirectHarness = {
  fetchCrawlerHtml: CrawlUrlRedirectMock
  crawlUrlForTest: (...args: Parameters<typeof crawlUrl>) => ReturnType<typeof crawlUrl>
  createMockCrawlerResult: (
    statusCode: number,
    canonicalUrl?: string | null,
    location?: string | null,
    meta?: Record<string, string>,
    responseHeaders?: Record<string, string>,
  ) => CrawlerHtmlResult
  user: () => PrivateUser
}

/**
 * Dependency-injected crawl redirect doubles for one suite. Call inside `describe` so each
 * file gets its own mocks under `isolate: false`.
 */
export function useCrawlUrlRedirectHarness(): CrawlUrlRedirectHarness {
  const fetchCrawlerHtml = vi.fn<VitestLooseMock>()
  const isUrlCrawlable = vi.fn<VitestLooseMock>().mockResolvedValue(true)
  const resolveSafeCrawlerAddresses = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

  let currentUser: PrivateUser | undefined

  beforeAll(async () => {
    currentUser = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function crawlUrlForTest(...args: Parameters<typeof crawlUrl>) {
    const [urlId, hopCount = 0, visitedUrls = new Set<string>(), options] = args
    return crawlUrl(urlId, hopCount, visitedUrls, {
      ...options,
      dependencies: {
        fetchCrawlerHtml,
        isUrlCrawlable,
        resolveSafeCrawlerAddresses,
        ...options?.dependencies,
      },
    })
  }

  function user(): PrivateUser {
    if (currentUser === undefined) {
      throw new Error('Crawl redirect test user is not initialized')
    }
    return currentUser
  }

  const createMockCrawlerResult = (
    statusCode: number,
    canonicalUrl: string | null = null,
    location: string | null = null,
    meta: Record<string, string> = {},
    responseHeaders: Record<string, string> = {},
  ): CrawlerHtmlResult => ({
    response_status_code: statusCode,
    request_headers: { 'User-Agent': 'test' },
    response_headers: { ...(location ? { location } : {}), ...responseHeaders },
    crawl_started_at: new Date(),
    crawl_completed_at: new Date(),
    content: {
      title: 'Test',
      meta,
      links: canonicalUrl ? { canonical: canonicalUrl } : {},
      content: 'Test content',
      canonicalUrl: canonicalUrl ?? undefined,
    },
  })

  return {
    fetchCrawlerHtml,
    crawlUrlForTest,
    createMockCrawlerResult,
    user,
  }
}
