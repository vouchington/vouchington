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
import * as httpUtils from '@modules/utils/http'

type CrawlerUtilsDependencies = {
  validateUrl: typeof validateUrl
  unsafeUrlError: typeof UnsafeUrlError
  fetchWithTimeout: typeof httpUtils.fetchWithTimeout
  readResponseBodyAsBuffer: typeof httpUtils.readResponseBodyAsBuffer
  handleHttpErrors: typeof httpUtils.handleHttpErrors
}

const defaultDependencies: CrawlerUtilsDependencies = {
  validateUrl,
  unsafeUrlError: UnsafeUrlError,
  fetchWithTimeout: httpUtils.fetchWithTimeout,
  readResponseBodyAsBuffer: httpUtils.readResponseBodyAsBuffer,
  handleHttpErrors: httpUtils.handleHttpErrors,
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
  } catch (error: unknown) {
    const duration = Date.now() - startedAt.getTime()
    if (httpUtils.isTimeoutError(error)) {
      trackCrawlerFailure(crawlerType, domain, 0, duration, 'CrawlerTimeoutError')
      throw new CrawlerTimeoutError(url, timeoutMs, duration, error)
    }
    if (error instanceof dependencies.unsafeUrlError) {
      trackCrawlerFailure(crawlerType, domain, 0, duration, 'CrawlerSsrfError')
      throw new CrawlerSsrfError(url, error.reason)
    }
    if (error instanceof Error) {
      trackCrawlerFailure(crawlerType, domain, 0, duration, 'CrawlerNetworkError')
      throw new CrawlerNetworkError(url, duration, error)
    }
    trackCrawlerFailure(crawlerType, domain, 0, duration, 'UnknownError')
    throw error
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
  } catch (error: unknown) {
    const duration = Date.now() - startedAt.getTime()
    if (error instanceof HttpResponseSizeError) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'ResponseSizeExceeded')
      throw new CrawlerResponseSizeExceededError(
        url,
        error.actualSize,
        error.maxSize,
        duration,
        error,
      )
    }
    if (error instanceof HttpNoBodyError) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'NoResponseBody')
      throw error
    }
    if (httpUtils.isTimeoutError(error)) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'CrawlerTimeoutError')
      throw new CrawlerTimeoutError(url, timeoutMs, duration, error)
    }
    if (error instanceof Error) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'CrawlerNetworkError')
      throw new CrawlerNetworkError(url, duration, error)
    }
    trackCrawlerFailure(crawlerType, domain, response.status, duration, 'ReadError')
    throw error
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
  } catch (error: unknown) {
    if (error instanceof HttpRateLimitError) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'CrawlerRateLimitError')
      throw new CrawlerRateLimitError(url, error.status, duration, error.retryAfterMs, error)
    }
    if (error instanceof HttpServerError) {
      trackCrawlerFailure(crawlerType, domain, response.status, duration, 'CrawlerServerError')
      throw new CrawlerServerError(url, error.status, duration, error)
    }
    throw error
  }
}
