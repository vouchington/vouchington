import { vi } from 'vitest'
import * as dnsFailures from '../../../services/urls-hostnames/dns-failures.mts'
import { crawlUrl } from '../../../services/crawls/crawl-url.mts'

/** Dependency-injected crawl doubles for a suite; call at module scope of each test file. */
export function createCrawlUrlErrorMocks() {
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

  return {
    fetchCrawlerHtml,
    isUrlCrawlable,
    resolveDnsCanary,
    resolveSafeCrawlerAddresses,
    crawlUrlForTest,
  }
}

export async function withRecordedDnsFailure<T>(run: () => Promise<T>): Promise<T> {
  const record = dnsFailures.recordHostnameDnsFailure
  const pending: Promise<unknown>[] = []
  const spy = vi
    .spyOn(dnsFailures, 'recordHostnameDnsFailure')
    .mockImplementation((hostnameId, resolveCanary) => {
      const result = record(hostnameId, resolveCanary)
      pending.push(result)
      return result
    })
  const [runResult] = await Promise.allSettled([Promise.resolve().then(run)])
  // Drain every real DNS-counter write before restoring the callthrough observer.
  const results = await Promise.allSettled(pending)
  const restored = await Promise.allSettled([Promise.resolve().then(() => spy.mockRestore())])
  const failures = [...results, ...restored].flatMap(result =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (failures.length > 0) {
    throw new AggregateError(
      runResult.status === 'rejected' ? [runResult.reason, ...failures] : failures,
      'DNS failure recording failed',
    )
  }
  if (runResult.status === 'rejected') throw runResult.reason
  return runResult.value
}
