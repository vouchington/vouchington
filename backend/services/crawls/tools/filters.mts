import { getMinUUIDv7ForDate } from '@modules/utils'
import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * Builds SQL filtering conditions for valid crawl chunks.
 *
 * Valid chunks must meet ALL of these conditions:
 * - Hostname not blocked (url_hostnames.blocked = false)
 * - Hostname is crawlable (url_hostnames.crawlable = true)
 * - Crawl has embeddings (crawls.embeddings_generated_at IS NOT NULL)
 * - Successful HTTP response (crawls.response_status_code = 200)
 * - Crawl completed (crawls.completed_at IS NOT NULL)
 * - No network errors (crawls.network_error IS NULL)
 * - Recent crawl (crawls.id UUIDv7 timestamp within last 30 days)
 *
 * @returns SQL statement with JOINs and WHERE conditions
 */
export function buildValidCrawlChunksFilter(): SQLStatement {
  const recentCrawlCutoffId = getMinUUIDv7ForDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

  return sql`/* buildValidCrawlChunksFilter:fragment */
    JOIN crawls ON crawls.id = crawl_chunks.crawl_id
    JOIN urls ON urls.id = crawls.url_id
    JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
    WHERE url_hostnames.blocked = false
      AND url_hostnames.crawlable = true
      AND crawls.embeddings_generated_at IS NOT NULL
      AND crawls.response_status_code = 200
      AND crawls.completed_at IS NOT NULL
      AND crawls.network_error IS NULL
      AND crawls.id >= ${recentCrawlCutoffId}
      AND crawl_chunks.crawl_id >= ${recentCrawlCutoffId}
  `
}
