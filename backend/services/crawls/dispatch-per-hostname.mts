import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import { computeHostnameRateLimitMs } from '@services/urls-domains-robots'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import onError from '@modules/on-error'
import { HTML_CRAWL_EXCLUSIVITY_SQL } from './html-crawl-eligibility-sql.mts'

const BATCH_SIZE = Number.parseInt(process.env.CRAWLER_BATCH_SIZE || '', 10) || 1000

/**
 * Given a hostname ID, dispatch crawl jobs for all URLs that need crawling.
 * Uses per-hostname age_threshold_days from the hostname-level dispatch system.
 */
export const dispatchCrawlUrlsPerHostname = async (hostnameId: string): Promise<number> => {
  const hostname = await getUrlHostnameCrawlerDetailsById(hostnameId)
  if (!hostname || !hostname.crawlable || hostname.blocked) return 0
  const attemptThresholdHours = hostname.attempt_threshold_hours ?? 1
  const attemptCutoffId = getMinUUIDv7ForDate(
    new Date(Date.now() - attemptThresholdHours * 60 * 60 * 1000),
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
      AND h.crawlable = true
      AND h.blocked = false
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.embeddings_generated_at IS NOT NULL
          AND c.embeddings_generated_at > NOW() - INTERVAL '1 day' * COALESCE(h.age_threshold_days, 1)
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

  await executeHandlerWithCursorInBatches<{ id: string }>(queryStatement, undefined, {
    batchSize: BATCH_SIZE,
    readOnly: true,
    handler: async rows => {
      total += rows.length
      await enqueueBulkCrawlUrls(
        rows.map(row => ({ urlId: row.id })),
        { hostnameId, rateLimitMs },
      )
    },
  })

  return total
}
