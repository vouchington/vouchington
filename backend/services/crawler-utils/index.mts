import {
  CrawlerTimeoutError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerServerError,
  CrawlerResponseSizeExceededError,
  HttpResponseSizeError,
  HttpNoBodyError,
  HttpRateLimitError,
  HttpServerError,
  CrawlerSsrfError,
} from '@modules/on-error/errors'
import { validateUrl, UnsafeUrlError } from 'ssrf-guard/node'
import { trackCrawlerRequest } from '@services/analytics'
import { extractDomain } from '@ts-shared/utils/urls'
import { fetchWithTimeout, handleHttpErrors } from '@modules/utils/http'
import { readResponseBodyAsBuffer } from '@modules/utils/http-body'
import { isTimeoutError } from '@vouchington/http-transport/fetch'

type CrawlerUtilsDependencies = {
  validateUrl: typeof validateUrl
  unsafeUrlError: typeof UnsafeUrlError
  fetchWithTimeout: typeof fetchWithTimeout
  readResponseBodyAsBuffer: typeof readResponseBodyAsBuffer
  handleHttpErrors: typeof handleHttpErrors
}

const defaultDependencies: CrawlerUtilsDependencies = {
  validateUrl,
  unsafeUrlError: UnsafeUrlError,
  fetchWithTimeout: fetchWithTimeout,
  readResponseBodyAsBuffer: readResponseBodyAsBuffer,
  handleHttpErrors: handleHttpErrors,
}
type CrawlerFailureType = NonNullable<Parameters<typeof trackCrawlerRequest>[5]>
const trackCrawlerFailure = (
  crawlerType: 'html' | 'rss',
  domain: string,
  status: number,
  duration: number,
  failureType: CrawlerFailureType,
) => trackCrawlerRequest(crawlerType, domain, status, duration, false, failureType)

interface FetchUrlOptions {
  url: string
  headers: Record<string, string>
  timeoutMs: number
  signal?: AbortSignal
  crawlerType: 'html' | 'rss'
  startedAt: Date
  dependencies?: Partial<CrawlerUtilsDependencies>
}

export const fetchUrl = async (
  options: FetchUrlOptions,
): Promise<{ response: Response; responseSignal: AbortSignal }> => {
  const { url, headers, timeoutMs, signal, crawlerType, startedAt } = options
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const domain = extractDomain(url)
  try {
    const initialRemainingTimeoutMs = timeoutMs - (Date.now() - startedAt.getTime())
    if (initialRemainingTimeoutMs <= 0) throw createAbortError(url, timeoutMs)
    const resolvedAddresses = await dependencies.validateUrl(url, {
      timeoutMs: initialRemainingTimeoutMs,
    })
    const remainingTimeoutMs = timeoutMs - (Date.now() - startedAt.getTime())
    if (remainingTimeoutMs <= 0) throw createAbortError(url, timeoutMs)
    // The request and response phases each get the full remaining budget independently, not a
    // division of it — consistent with crawl-url's per-phase model (see modules/utils/http.mts).
    return await dependencies.fetchWithTimeout({
      url,
      headers,
      requestTimeoutMs: remainingTimeoutMs,
      responseTimeoutMs: remainingTimeoutMs,
      resolvedAddresses,
      signal,
    })
  } catch (err: unknown) {
    const duration = Date.now() - startedAt.getTime()
    if (isTimeoutError(err)) {
      trackCrawlerFailure(crawlerType, domain, 0, duration, 'CrawlerTimeoutError')
      throw new CrawlerTimeoutError(url, timeoutMs, duration, err)
    }
    if (err instanceof dependencies.unsafeUrlError) {
      trackCrawlerFailure(crawlerType, domain, 0, duration, 'CrawlerSsrfError')
      throw new CrawlerSsrfError(url, err.reason)
    }
    if (err instanceof Error) {
      trackCrawlerFailure(crawlerType, domain, 0, duration, 'CrawlerNetworkError')
      throw new CrawlerNetworkError(url, duration, err)
    }
    trackCrawlerFailure(crawlerType, domain, 0, duration, 'UnknownError')
    throw err
  }
}
function createAbortError(url: string, timeoutMs: number): Error {
  const error = new Error(`Request to ${url} timed out after ${timeoutMs}ms`)
  error.name = 'AbortError'
  return error
}
interface ReadBodyOptions {
  response: Response
  url: string
  maxSizeBytes: number
  timeoutMs: number
  signal?: AbortSignal
  crawlerType: 'html' | 'rss'
  startedAt: Date
  dependencies?: Partial<CrawlerUtilsDependencies>
}

export const readBodyAsBuffer = async (options: ReadBodyOptions): Promise<Buffer> => {
  const { response, url, maxSizeBytes, timeoutMs, signal, crawlerType, startedAt } = options
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const domain = extractDomain(url)
  try {
    const buffer = await dependencies.readResponseBodyAsBuffer({
      response,
      url,
      maxSizeBytes,
      signal,
    })
    return buffer
  } catch (err: unknown) {
    const duration = Date.now() - startedAt.getTime()
    if (err instanceof HttpResponseSizeError) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'ResponseSizeExceeded')
      throw new CrawlerResponseSizeExceededError(url, err.actualSize, err.maxSize, duration, err)
    }
    if (err instanceof HttpNoBodyError) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'NoResponseBody')
      throw err
    }
    if (isTimeoutError(err)) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'CrawlerTimeoutError')
      throw new CrawlerTimeoutError(url, timeoutMs, duration, err)
    }
    if (err instanceof Error) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'CrawlerNetworkError')
      throw new CrawlerNetworkError(url, duration, err)
    }
    trackCrawlerFailure(crawlerType, domain, response.status, duration, 'ReadError')
    throw err
  }
}
interface HandleErrorsOptions {
  response: Response
  url: string
  crawlerType: 'html' | 'rss'
  startedAt: Date
  dependencies?: Partial<CrawlerUtilsDependencies>
}

export const handleErrors = (options: HandleErrorsOptions): void => {
  const { response, url, crawlerType, startedAt } = options
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const domain = extractDomain(url)
  const duration = Date.now() - startedAt.getTime()

  try {
    dependencies.handleHttpErrors({ response, url })
  } catch (err: unknown) {
    if (err instanceof HttpRateLimitError) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'CrawlerRateLimitError')
      throw new CrawlerRateLimitError(url, err.status, duration, err.retryAfterMs, err)
    }
    if (err instanceof HttpServerError) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'CrawlerServerError')
      throw new CrawlerServerError(url, err.status, duration, err)
    }
    throw err
  }
}
