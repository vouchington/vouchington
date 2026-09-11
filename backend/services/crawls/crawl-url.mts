import CrawlerHtml from '@services/crawler-html'
import { CrawlerTimeoutError } from '@modules/on-error/errors'
import { loadCrawlPreflight } from './crawl-url/preflight.mts'
import { resolveSafeCrawlerAddresses } from './crawl-url/safety.mts'
import { handleCrawlRedirect, hasRedirectStatusRecorded } from './crawl-url/redirects.mts'
import { persistCrawlContent } from './crawl-url/content.mts'
import { recordCrawlError } from './crawl-url/errors.mts'
import type { CrawlUrlOptions, CrawlUrlReturn } from './crawl-url/types.mts'

/** Total ceiling across the whole redirect-hop chain when the caller sets no `totalTimeoutMs`. */
const DEFAULT_TOTAL_CRAWL_TIMEOUT_MS = 60_000

/**
 * Stamps an absolute total-ceiling `deadlineAt` on the first hop, or carries an existing one
 * through unchanged on later hops — `handleCrawlRedirect` forwards the returned options object
 * verbatim into the recursive `crawlUrl` call, so hop 2+ inherits hop 1's remaining budget
 * instead of restarting a fresh `totalTimeoutMs`. Must return a real object even when `options`
 * is `undefined` (the default production path — see `backend/workers/crawler/processors.mts`):
 * returning `options` itself unchanged in that case would drop `deadlineAt` and reset the ceiling
 * on every hop.
 */
export function scopeCrawlDeadline(
  options: CrawlUrlOptions | undefined,
): CrawlUrlOptions & { deadlineAt: number } {
  const deadlineAt =
    options?.deadlineAt ?? Date.now() + (options?.totalTimeoutMs ?? DEFAULT_TOTAL_CRAWL_TIMEOUT_MS)
  return { ...options, deadlineAt }
}

const fetchCrawlHtml = async (
  url: string,
  lastModifiedAt: Parameters<typeof CrawlerHtml>[0]['lastModifiedAt'],
  etag: Parameters<typeof CrawlerHtml>[0]['etag'],
  timeoutMs: CrawlUrlOptions['timeoutMs'],
  maxResponseSizeBytes: Parameters<typeof CrawlerHtml>[0]['maxResponseSizeBytes'],
  skipEmbedResolution: Parameters<typeof CrawlerHtml>[0]['skipEmbedResolution'],
  crawlerOptions: Parameters<typeof CrawlerHtml>[1],
  dependencies: CrawlUrlOptions['dependencies'],
) => {
  const resolveCrawlerAddresses =
    dependencies?.resolveSafeCrawlerAddresses ?? resolveSafeCrawlerAddresses
  const fetchCrawlerHtml = dependencies?.fetchCrawlerHtml ?? CrawlerHtml
  // `timeoutMs`, when set, is a per-phase budget applied independently to DNS resolution, the
  // request-to-headers phase, and the response-body phase — not one value divided between them.
  const resolvedAddresses = await resolveCrawlerAddresses(url, { timeoutMs })
  return await fetchCrawlerHtml(
    {
      url,
      lastModifiedAt,
      etag,
      requestTimeoutMs: timeoutMs,
      responseTimeoutMs: timeoutMs,
      maxResponseSizeBytes,
      skipEmbedResolution,
      resolvedAddresses,
    },
    crawlerOptions,
  )
}

export const crawlUrl = async (
  urlId: string,
  hopCount: number = 0,
  visitedUrls: Set<string> = new Set(),
  options?: CrawlUrlOptions,
): Promise<CrawlUrlReturn> => {
  const scopedOptions = scopeCrawlDeadline(options)
  const { deadlineAt, dependencies } = scopedOptions
  const preflight = await loadCrawlPreflight(urlId, hopCount, visitedUrls, scopedOptions)
  if (!preflight) return null

  const { crawl, crawlerOptions, etag, hostname, lastModifiedAt, previousHtmlSha256, url } =
    preflight
  let crawlStatusRecorded = false

  try {
    if (Date.now() >= deadlineAt) {
      const totalTimeoutMs = scopedOptions.totalTimeoutMs ?? DEFAULT_TOTAL_CRAWL_TIMEOUT_MS
      throw new CrawlerTimeoutError(
        url.url,
        totalTimeoutMs,
        Date.now() - (deadlineAt - totalTimeoutMs),
      )
    }

    const htmlResult = await fetchCrawlHtml(
      url.url,
      lastModifiedAt,
      etag,
      scopedOptions.timeoutMs,
      scopedOptions.maxResponseSizeBytes,
      scopedOptions.skipEmbedResolution,
      crawlerOptions,
      dependencies,
    )

    try {
      const redirect = await handleCrawlRedirect({
        crawlId: crawl.id,
        dependencies,
        htmlResult,
        hopCount,
        options: scopedOptions,
        runCrawlUrl: crawlUrl,
        url,
        visitedUrls,
      })
      crawlStatusRecorded = redirect.statusRecorded
      if (redirect.handled) return redirect.crawl ?? null

      return await persistCrawlContent({
        crawlId: crawl.id,
        hostname,
        htmlResult,
        options: scopedOptions,
        previousHtmlSha256,
        previousHtmlSnapshotUploadedAt: preflight.previousHtmlSnapshotUploadedAt,
        url,
      })
    } finally {
      await htmlResult.htmlFile?.cleanup()
    }
  } catch (error) {
    const hasRecordedStatus = crawlStatusRecorded || hasRedirectStatusRecorded(error)
    await recordCrawlError({
      crawlId: crawl.id,
      crawlStatusRecorded: hasRecordedStatus,
      dependencies,
      error,
      hostname,
      urlId: url.id,
    })
    throw error
  }
}
