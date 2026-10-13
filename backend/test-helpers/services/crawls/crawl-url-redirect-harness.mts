import { AsyncLocalStorage } from 'node:async_hooks'
import { beforeAll, beforeEach, onTestFinished, vi } from 'vitest'
import * as dnsFailures from '../../../services/urls-hostnames/dns-failures.mts'
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
  type CrawlScope = {
    crawls: Array<ReturnType<typeof crawlUrl>>
    writes: Array<Promise<void>>
    cleaning: boolean
  }
  const ownedCrawls = new AsyncLocalStorage<CrawlScope>()
  let currentScope: CrawlScope | undefined

  beforeAll(async () => {
    currentUser = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    const scope: CrawlScope = { crawls: [], writes: [], cleaning: false }
    currentScope = scope
    const recordFailure = dnsFailures.recordHostnameDnsFailure
    const resetFailures = dnsFailures.resetHostnameDnsFailures
    const failureSpy = vi
      .spyOn(dnsFailures, 'recordHostnameDnsFailure')
      .mockImplementation((...args) => {
        const result = recordFailure(...args)
        ownedCrawls.getStore()?.writes.push(result)
        return result
      })
    const resetSpy = vi
      .spyOn(dnsFailures, 'resetHostnameDnsFailures')
      .mockImplementation((...args) => {
        const result = resetFailures(...args)
        ownedCrawls.getStore()?.writes.push(result)
        return result
      })
    let cleanup: Promise<void> | undefined
    const drainOwnedCrawls = async (): Promise<void> => {
      scope.cleaning = true
      // Expected crawl rejections are asserted by the caller; still drain their real work.
      await Promise.allSettled(scope.crawls)
      const writes = await Promise.allSettled(scope.writes)
      const restored = await Promise.allSettled([
        Promise.resolve().then(() => failureSpy.mockRestore()),
        Promise.resolve().then(() => resetSpy.mockRestore()),
      ])
      const failures = [...writes, ...restored].flatMap(result =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Owned crawl DNS cleanup failed')
      }
    }
    onTestFinished(() => (cleanup ??= drainOwnedCrawls()), 30_000)
  })

  function crawlUrlForTest(...args: Parameters<typeof crawlUrl>) {
    const [urlId, hopCount = 0, visitedUrls = new Set<string>(), options] = args
    const scope = currentScope
    if (!scope || scope.cleaning) throw new Error('Crawl test scope is not accepting work')
    const crawl = ownedCrawls.run(scope, () =>
      crawlUrl(urlId, hopCount, visitedUrls, {
        ...options,
        dependencies: {
          fetchCrawlerHtml,
          isUrlCrawlable,
          resolveSafeCrawlerAddresses,
          ...options?.dependencies,
        },
      }),
    )
    scope.crawls.push(crawl)
    return crawl
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
