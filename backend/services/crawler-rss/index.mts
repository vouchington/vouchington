import { CRAWLER_USER_AGENT } from '@voucha/config'
import {
  crawlFeed,
  type FeedResponseErrorContext,
  type FeedTransport,
} from '@vouchington/rss-crawler'
import { RSS_CONTENT_TYPES } from '@vouchington/rss-parser'
import { trackCrawlerRequest } from '@services/analytics'
import { fetchUrl, readBodyAsBuffer, handleErrors } from '@services/crawler-utils'
import { extractDomain } from '@ts-shared/utils/urls'
import { CrawlerInvalidContentTypeError, CrawlerHttpClientError } from '@modules/on-error/errors'
import type { CrawlerRssOptions, CrawlerRssResult } from './types.mts'

type CrawlerRssDependencies = {
  fetchUrl: typeof fetchUrl
  readBodyAsBuffer: typeof readBodyAsBuffer
  handleErrors: typeof handleErrors
}

type CrawlerRssRuntimeOptions = CrawlerRssOptions & {
  dependencies?: Partial<CrawlerRssDependencies>
}

const defaultDependencies: CrawlerRssDependencies = {
  fetchUrl,
  readBodyAsBuffer,
  handleErrors,
}

export type { CrawlerRssResult, CrawlerRssRedirect } from './types.mts'

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_RESPONSE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const RSS_CONTENT_TYPE_EXPECTED_TYPES = [...new Set([...RSS_CONTENT_TYPES, '*/*+xml'])]

/* no-mistakes: integration=http */
export default async function CrawlerRss(
  url: string,
  options: CrawlerRssRuntimeOptions = {},
): Promise<CrawlerRssResult> {
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const startedAt = new Date()
  const domain = extractDomain(url)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxResponseSizeBytes = options.maxResponseSizeBytes ?? DEFAULT_MAX_RESPONSE_SIZE_BYTES
  let parsedBody: { response: Response; byteLength: number } | undefined
  // Captured by transport.fetch and combined with the package's own context.signal in
  // responseBodyReader below — FeedTransport.fetch must return a bare Response, so the
  // body-phase signal can't travel through the return value.
  let bodyPhaseSignal: AbortSignal | undefined

  const transport: FeedTransport = {
    fetch: async (requestUrl, requestOptions) => {
      const { response, responseSignal } = await dependencies.fetchUrl({
        url: requestUrl,
        headers: requestOptions.headers,
        timeoutMs,
        signal: requestOptions.signal,
        crawlerType: 'rss',
        startedAt,
      })
      bodyPhaseSignal = responseSignal
      return response
    },
  }

  try {
    const result = await crawlFeed(url, {
      transport,
      userAgent: CRAWLER_USER_AGENT,
      headers: {
        ...options.headers,
        'Accept-Encoding': 'gzip, deflate, br',
      },
      timeoutMs,
      maxResponseSizeBytes,
      redirectResolver: ({ location }) => location,
      responseBodyReader: async context => {
        const signal = bodyPhaseSignal
          ? AbortSignal.any([bodyPhaseSignal, context.signal])
          : context.signal
        const body = await dependencies.readBodyAsBuffer({
          response: context.response,
          url: context.url,
          maxSizeBytes: context.maxResponseSizeBytes,
          timeoutMs,
          signal,
          crawlerType: 'rss',
          startedAt,
        })
        parsedBody = { response: context.response, byteLength: body.length }
        return body
      },
      responseErrorHandler: context => mapResponseError(context, dependencies, startedAt, domain),
    })

    const duration = Date.now() - startedAt.getTime()
    trackCrawlerRequest('rss', domain, result.responseCode, duration, true)
    return {
      ...result,
      contentSha256: result.contentSha256 ? Buffer.from(result.contentSha256) : null,
    }
  } catch (error) {
    if (!parsedBody) throw error

    const duration = Date.now() - startedAt.getTime()
    trackCrawlerRequest(
      'rss',
      domain,
      parsedBody.response.status,
      duration,
      false,
      'ParseFeedError',
    )
    const parseError = new Error(
      `Failed to parse feed XML for ${url} with response code ${parsedBody.response.status}`,
      { cause: error instanceof Error ? error : undefined },
    )
    Object.assign(parseError, {
      extra: {
        rssFeedUrl: url,
        responseCode: parsedBody.response.status,
        xmlBytes: parsedBody.byteLength,
        etag: parsedBody.response.headers.get('etag') || null,
        lastModified: parsedBody.response.headers.get('last-modified') || null,
      },
      tags: { operation: 'parseFeed' },
    })
    throw parseError
  }
}

function mapResponseError(
  context: FeedResponseErrorContext,
  dependencies: CrawlerRssDependencies,
  startedAt: Date,
  domain: string,
): Error {
  const duration = Date.now() - startedAt.getTime()

  if (context.type === 'content-type') {
    trackCrawlerRequest(
      'rss',
      domain,
      context.response.status,
      duration,
      false,
      'InvalidContentType',
    )
    return new CrawlerInvalidContentTypeError(
      context.url,
      context.contentType,
      duration,
      RSS_CONTENT_TYPE_EXPECTED_TYPES,
    )
  }

  if (context.type === 'redirect') {
    trackCrawlerRequest('rss', domain, context.status, duration, true)
    return new CrawlerHttpClientError(context.url, context.status, duration)
  }

  dependencies.handleErrors({
    response: context.response,
    url: context.url,
    crawlerType: 'rss',
    startedAt,
  })

  trackCrawlerRequest('rss', domain, context.status, duration, false, 'HttpError')
  return new CrawlerHttpClientError(context.url, context.status, duration)
}
