import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { getOrCreateCrawlerForHostname } from '@services/crawlers'
import { getLatestHtmlSnapshotCrawlBefore } from '@services/crawls/get-latest-html-snapshot-before'
import { getCrawlById } from '@services/crawls/get'
import { isRobotsTxtIgnoredForFeeds } from './crawl-config.mts'
import type {
  CrawlerHtmlStructuredObject,
  CrawlerHtmlStructuredValue,
} from '@services/crawls/types'
import { safeResolveUrl } from '@services/crawls/crawl-url-utils'
import { addUrl, getUrlById } from '@services/urls'
import { isPublicRssFeedUrl } from './url-validation.mts'
import { RssFeedDiscoveryPendingError } from './discovery-pending.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueUserRssFeedImportRowContinuation } from '@queues/user-rss-feed-imports/enqueues'
import onError from '@modules/on-error'
import { randomUUID } from 'node:crypto'

const FEED_TYPE_ORDER = [
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/json',
] as const

export function extractFeedLinkFromCrawlLinks(
  links: CrawlerHtmlStructuredObject | null | undefined,
  baseUrl: string,
): string | null {
  const alternate = links?.alternate
  if (!isStructuredObject(alternate)) return null
  for (const feedType of FEED_TYPE_ORDER) {
    for (const href of getAlternateHrefsForType(alternate, feedType)) {
      const resolved = safeResolveUrl(href, baseUrl)
      if (resolved && resolved !== baseUrl && isPublicRssFeedUrl(resolved)) return resolved
    }
  }
  return null
}

/** Enqueues an HTML crawl, leaving the import row pending until the crawler records its result. */
export async function discoverFeedUrlFromHtml(
  pageUrl: string,
  importRowId?: string,
): Promise<string | null> {
  if (!importRowId) return null
  const preserveHttp = new URL(pageUrl).protocol === 'http:'
  const url = await addUrl(null, pageUrl, { preserveHttp, skipCreatedEvents: true })
  const hostnameId = url?.hostname?.id
  if (!url || !hostnameId) return null
  const { rows } = await write<{
    discovery_url_id: string | null
    discovered_feed_url: string | null
    discovery_failed_at: Date | null
  }>(
    sql`/* discoverFeedUrlFromHtml */
      SELECT discovery_url_id, discovered_feed_url, discovery_failed_at
      FROM user_rss_feed_import_rows WHERE id = ${importRowId}
    `,
  )
  const state = rows[0]
  if (!state) return null
  if (state.discovery_url_id === url.id) {
    if (state.discovered_feed_url) return state.discovered_feed_url
    if (state.discovery_failed_at) return null
  }

  await getOrCreateCrawlerForHostname(null, hostnameId)
  const generation = randomUUID()
  const requested = await write(sql`/* markRssFeedImportDiscoveryRequested */
    UPDATE user_rss_feed_import_rows
    SET discovery_url_id = ${url.id}, discovery_generation = ${generation}::uuid,
        discovery_crawl_id = NULL, discovered_feed_url = NULL, discovery_failed_at = NULL
    WHERE id = ${importRowId} AND completed_at IS NULL AND failed_at IS NULL
    RETURNING id
  `)
  if (requested.rows.length === 0) return null
  await enqueueBulkCrawlUrls(
    [
      {
        urlId: url.id,
        options: {
          importRowId,
          importDiscoveryGeneration: generation,
          crawlTimeoutMs: 10_000,
          ensureCrawlerForRedirects: true,
          ignoreRobotsTxt: isRobotsTxtIgnoredForFeeds(),
          maxResponseSizeBytes: 256 * 1024,
          preserveHttpRedirects: preserveHttp,
          skipCanonicalUrl: true,
          skipChunks: true,
          skipEmbedResolution: true,
          skipCreatedEventsForRedirects: true,
        },
      },
    ],
    { hostnameId, rateLimitMs: 1_000 },
  )
  throw new RssFeedDiscoveryPendingError()
}

/** Called after crawl persistence; recovery can replay the pending row if enqueue fails. */
export async function completeRssFeedImportDiscovery(
  importRowId: string,
  requestedUrlId: string,
  generation: string,
  result: { url_id: string; crawl_id: string; response_status_code: number } | null,
): Promise<void> {
  let feedUrl: string | null = null
  if (
    result &&
    (result.response_status_code === 304 ||
      (result.response_status_code >= 200 && result.response_status_code < 300))
  ) {
    const crawledUrl = await getUrlById(result.url_id, { readOnly: false })
    if (crawledUrl) {
      const crawl =
        result.response_status_code === 304
          ? await getLatestHtmlSnapshotCrawlBefore(result.url_id, result.crawl_id, {
              readOnly: false,
            })
          : await getCrawlById(result.crawl_id, result.url_id, { readOnly: false })
      feedUrl = extractFeedLinkFromCrawlLinks(crawl?.links, crawledUrl.url)
    }
  }
  const { rows } = await write<{ batch_id: string }>(sql`/* completeRssFeedImportDiscovery */
    UPDATE user_rss_feed_import_rows
    SET discovery_crawl_id = ${result?.crawl_id ?? null}::uuid,
        discovered_feed_url = ${feedUrl},
        discovery_failed_at = CASE WHEN ${feedUrl}::text IS NULL THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ${importRowId} AND discovery_url_id = ${requestedUrlId}
      AND discovery_generation = ${generation}::uuid
      AND completed_at IS NULL AND failed_at IS NULL
    RETURNING batch_id
  `)
  const row = rows[0]
  if (row) await enqueueUserRssFeedImportRowContinuation(row.batch_id, importRowId).catch(onError)
}

function getAlternateHrefsForType(
  alternate: CrawlerHtmlStructuredObject,
  feedType: string,
): string[] {
  const hrefs: string[] = []
  const exact = alternate[feedType]
  if (exact !== undefined) hrefs.push(...structuredValueToStrings(exact))
  for (const [type, value] of Object.entries(alternate)) {
    if (type !== feedType && type.toLowerCase().trim() === feedType.toLowerCase())
      hrefs.push(...structuredValueToStrings(value))
  }
  return hrefs
}

function structuredValueToStrings(value: CrawlerHtmlStructuredValue | undefined): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(item => (typeof item === 'string' ? [item] : []))
  return []
}

function isStructuredObject(
  value: CrawlerHtmlStructuredValue | undefined,
): value is CrawlerHtmlStructuredObject {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
