import type { CrawlerHtmlToMarkdownOptions } from '@services/crawlers/html-to-md-config'
import { extractHtmlContent, isHtmlContentType } from '@vouchington/crawler-html'
import { readFile } from 'node:fs/promises'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import { fetchWithTimeout, handleHttpErrors, isTimeoutError } from '@modules/utils/http'
import type { CrawlerHtmlOptions, CrawlerHtmlResult } from './types.mts'
import { writeResponseToTemporaryFile } from './response-file.mts'
import { planCrawlerEmbed } from '@services/crawl-embeds/embed-resolver'
import { trackCrawlerRequest } from '@services/analytics'
import { extractDomain } from '@ts-shared/utils/urls'
import {
  HttpRateLimitError,
  HttpServerError,
  HttpResponseSizeError,
  HttpNoBodyError,
  CrawlerTimeoutError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerServerError,
  CrawlerResponseSizeExceededError,
} from '@modules/on-error/errors'

export type { CrawlerHtmlOptions, CrawlerHtmlResult } from './types.mts'

export const DEFAULT_REQUEST_TIMEOUT_MS = 5000
export const DEFAULT_RESPONSE_TIMEOUT_MS = 5000
const DEFAULT_MAX_RESPONSE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_CRAWLER_HTML_BYTES = 4 * 1024 * 1024

/** Fetches an HTML response under Vouchington transport policy and extracts its content upstream. */
/* no-mistakes: integration=http */
export async function fetchCrawlerHtml(
  {
    url,
    lastModifiedAt,
    etag,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    responseTimeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS,
    maxResponseSizeBytes = DEFAULT_MAX_RESPONSE_SIZE_BYTES,
    skipEmbedResolution = false,
    resolvedAddresses,
  }: CrawlerHtmlOptions,
  markdownOptions: CrawlerHtmlToMarkdownOptions,
): Promise<CrawlerHtmlResult> {
  const startedAt = new Date()
  const headers: Record<string, string> = {
    'User-Agent': CRAWLER_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
  }
  if (lastModifiedAt) headers['If-Modified-Since'] = lastModifiedAt
  if (etag) headers['If-None-Match'] = etag

  const { response, responseSignal } = await fetchWithTimeout({
    url,
    headers,
    requestTimeoutMs,
    responseTimeoutMs,
    resolvedAddresses,
  })
  const response_headers = Object.fromEntries(response.headers?.entries() ?? [])
  const output: CrawlerHtmlResult = {
    request_headers: headers,
    response_headers,
    response_status_code: response.status,
    crawl_started_at: startedAt,
    crawl_completed_at: new Date(),
  }

  if (response.status === 204 || response.status === 304) {
    response.body?.cancel()
    return output
  }

  handleHttpErrors({ response, url })
  const contentType = response.headers?.get('content-type')
  if (!contentType || !isHtmlContentType(contentType)) {
    response.body?.cancel()
    return output
  }

  const htmlFile = await writeResponseToTemporaryFile(
    response,
    url,
    Math.min(maxResponseSizeBytes, MAX_CRAWLER_HTML_BYTES),
    responseSignal,
  )
  try {
    // @vouchington/crawler-html currently accepts Uint8Array only. This read is bounded at 4 MiB;
    // the response, snapshot, and hash paths remain file/stream based.
    output.content = await extractHtmlContent(
      await readFile(htmlFile.filePath),
      contentType,
      markdownOptions,
    )
    if (!skipEmbedResolution) {
      const plan = await planCrawlerEmbed(url, output.content)
      if (plan !== undefined) {
        output.embedMetadata = plan?.embed ?? null
        output.embedOEmbedUrl = plan?.oEmbedUrl ?? null
      }
    }
    output.htmlFile = htmlFile
  } catch (error) {
    await htmlFile.cleanup()
    throw error
  }
  return output
}

export default async function CrawlerHtml(
  options: CrawlerHtmlOptions,
  markdownOptions: CrawlerHtmlToMarkdownOptions,
): Promise<CrawlerHtmlResult> {
  const startedAt = new Date()
  const {
    url,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    responseTimeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS,
  } = options
  const domain = extractDomain(url)

  try {
    const result = await fetchCrawlerHtml(options, markdownOptions)
    const duration = Date.now() - startedAt.getTime()
    trackCrawlerRequest('html', domain, result.response_status_code, duration, true)
    return result
  } catch (error: unknown) {
    const duration = Date.now() - startedAt.getTime()

    if (isTimeoutError(error)) {
      trackCrawlerRequest('html', domain, 0, duration, false, 'CrawlerTimeoutError')
      // Which phase timed out is not recoverable from the error alone — both raise the same
      // DOMException('TimeoutError'). `timeoutMs` here only feeds the error message text, so pick
      // the request budget for a fast failure and the response budget once elapsed time has moved
      // past it (i.e. headers must have already arrived).
      const timedOutPhaseMs = duration < requestTimeoutMs ? requestTimeoutMs : responseTimeoutMs
      throw new CrawlerTimeoutError(url, timedOutPhaseMs, duration, error)
    }

    if (error instanceof HttpRateLimitError) {
      trackCrawlerRequest('html', domain, error.status, duration, false, 'CrawlerRateLimitError')
      throw new CrawlerRateLimitError(url, error.status, duration, error.retryAfterMs, error)
    }

    if (error instanceof HttpServerError) {
      trackCrawlerRequest('html', domain, error.status, duration, false, 'CrawlerServerError')
      throw new CrawlerServerError(url, error.status, duration, error)
    }

    if (error instanceof HttpResponseSizeError) {
      trackCrawlerRequest('html', domain, 0, duration, false, 'ResponseSizeExceeded')
      throw new CrawlerResponseSizeExceededError(
        url,
        error.actualSize,
        error.maxSize,
        duration,
        error,
      )
    }

    if (error instanceof HttpNoBodyError) {
      trackCrawlerRequest('html', domain, 0, duration, false, 'NoResponseBody')
      throw error
    }

    if (error instanceof Error) {
      trackCrawlerRequest('html', domain, 0, duration, false, 'CrawlerNetworkError')
      throw new CrawlerNetworkError(url, duration, error)
    }

    trackCrawlerRequest('html', domain, 0, duration, false, 'UnknownError')
    throw error
  }
}
