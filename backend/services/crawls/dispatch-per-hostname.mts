import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import { computeHostnameRateLimitMs } from '@services/urls-domains-robots'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import onError from '@modules/on-error'
import { HTML_CRAWL_EXCLUSIVITY_SQL } from './html-crawl-eligibility-sql.mts'

import { getCrawlDispatchLimits } from './work-limits.mts'
import type { CrawlDispatchCursor } from '@queues/crawl-hostnames/types'

/**
 * Given a hostname ID, dispatch a bounded page of URLs that need crawling.
 * Uses per-hostname age_threshold_days from the hostname-level dispatch system.
 */
export const dispatchCrawlUrlsPerHostname = async (
  hostnameId: string,
  cursor?: CrawlDispatchCursor,
  saveProgress?: (cursor: CrawlDispatchCursor) => Promise<void>,
) => {
  const limits = getCrawlDispatchLimits()
  const sweepStartedAt = cursor?.sweepStartedAt ?? new Date().toISOString()
  await saveProgress?.({ sweepStartedAt, ...(cursor?.afterId && { afterId: cursor.afterId }) })
  const upperId = getMinUUIDv7ForDate(new Date(sweepStartedAt))
  const hostname = await getUrlHostnameCrawlerDetailsById(hostnameId)
  if (!hostname || !hostname.crawlable || hostname.blocked) return { count: 0, hasMore: false }
  const attemptThresholdHours = hostname.attempt_threshold_hours ?? 1
  const attemptCutoffId = getMinUUIDv7ForDate(
    new Date(new Date(sweepStartedAt).getTime() - attemptThresholdHours * 60 * 60 * 1000),
  )

  // Compute rate limit once — robots.txt is Valkey-cached so this is cheap
  let rateLimitMs: number | undefined
  try {
    rateLimitMs = await computeHostnameRateLimitMs(
      hostname.hostname,
      hostname.requests_per_second_limit,
      CRAWLER_USER_AGENT,
    )
  } catch (err) {
    // Log unexpected errors from robots.txt fetch for observability
    onError(err instanceof Error ? err : new Error(String(err)))
  }

  const queryStatement = sql`/* dispatchCrawlUrlsPerHostname */
    SELECT u.id
    FROM urls u
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE u.hostname_id = ${hostnameId}
      AND u.id < ${upperId}::uuid
      AND (${cursor?.afterId ?? null}::uuid IS NULL OR u.id > ${cursor?.afterId ?? null}::uuid)
      AND h.crawlable = true
      AND h.blocked = false
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.embeddings_generated_at IS NOT NULL
          AND c.embeddings_generated_at > ${sweepStartedAt}::timestamptz - INTERVAL '1 day' * COALESCE(h.age_threshold_days, 1)
      )
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.id > ${attemptCutoffId}
      )
  `
  queryStatement.append(HTML_CRAWL_EXCLUSIVITY_SQL).append(sql`
    ORDER BY u.id ASC
  `)
  let total = 0

  const result = await executeHandlerWithCursorInBatches<{ id: string }>(
    queryStatement,
    undefined,
    {
      batchSize: limits.batchSize,
      maxRows: limits.maxRows,
      readOnly: true,
      handler: async rows => {
        total += rows.length
        await enqueueBulkCrawlUrls(
          rows.map(row => ({ urlId: row.id })),
          { hostnameId, rateLimitMs },
        )
        await saveProgress?.({ sweepStartedAt, afterId: rows.at(-1)!.id })
      },
    },
  )

  return { count: total, hasMore: result.hasMore }
}
