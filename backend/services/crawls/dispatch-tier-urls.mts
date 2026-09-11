import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import {
  getEntityRelationUrlTables,
  getEntityRelationUrlTablesWithElections,
  positiveVoteConditions,
} from '@services/entity-relations'
import { computeHostnameRateLimitMs } from '@services/urls-domains-robots'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import onError from '@modules/on-error'
import { HTML_CRAWL_EXCLUSIVITY_SQL } from './html-crawl-eligibility-sql.mts'

const BATCH_SIZE = Number.parseInt(process.env.CRAWLER_BATCH_SIZE || '', 10) || 1000

const TIER_1_AGE_DAYS = 7
const TIER_2_AGE_DAYS = 30
const ATTEMPT_THRESHOLD_HOURS = 1

async function enqueueByHostname(
  rows: {
    id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }[],
): Promise<void> {
  const byHostname = new Map<
    string,
    { urlIds: string[]; hostname: string; requestsPerSecondLimit: number | null }
  >()
  for (const row of rows) {
    const group = byHostname.get(row.hostname_id) ?? {
      urlIds: [],
      hostname: row.hostname,
      requestsPerSecondLimit: row.requests_per_second_limit,
    }
    group.urlIds.push(row.id)
    byHostname.set(row.hostname_id, group)
  }
  // Process hostnames serially to avoid a thundering herd of concurrent robots.txt fetches.
  // This is acceptable because robots.txt responses are cached in Valkey for 24 hours, so only
  // the first job per hostname actually fetches robots.txt. Subsequent jobs for the same hostname
  // within the TTL use the cached result.
  // Fall back to undefined (default rate limit) if robots.txt fetch fails.
  for (const [hostnameId, { urlIds, hostname, requestsPerSecondLimit }] of byHostname) {
    let rateLimitMs: number | undefined
    try {
      // oxlint-disable-next-line no-await-in-loop -- serialize robots checks to avoid a cross-hostname request burst
      rateLimitMs = await computeHostnameRateLimitMs(
        hostname,
        requestsPerSecondLimit,
        CRAWLER_USER_AGENT,
      )
    } catch (err) {
      // Log unexpected errors from robots.txt fetch for observability
      onError(err instanceof Error ? err : new Error(String(err)))
    }
    // oxlint-disable-next-line no-await-in-loop -- preserve queue backpressure before dispatching the next hostname
    await enqueueBulkCrawlUrls(
      urlIds.map(urlId => ({ urlId })),
      { hostnameId, rateLimitMs },
    )
  }
}

/**
 * Dispatch Tier 1 URLs for crawling (every 7 days).
 * Tier 1: URLs referenced by entity relations with positive votes,
 * or user profile links.
 */
export const dispatchTier1CrawlUrls = async (): Promise<number> => {
  const attemptCutoffId = getMinUUIDv7ForDate(
    new Date(Date.now() - ATTEMPT_THRESHOLD_HOURS * 60 * 60 * 1000),
  )
  const tierCondition = `(
    ${positiveVoteConditions(getEntityRelationUrlTablesWithElections()).join('\n    OR ')}
    OR EXISTS (
      SELECT 1 FROM user_profile_links upl WHERE upl.url_id = u.id
    )
  )`

  const queryStatement = sql`/* dispatchTier1CrawlUrls */
    SELECT u.id, h.id AS hostname_id, h.hostname, h.requests_per_second_limit
    FROM urls u
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE h.crawlable = true
      AND h.blocked = false
      AND `
  queryStatement
    .append(tierCondition)
    .append(sql`
      `)
    .append(HTML_CRAWL_EXCLUSIVITY_SQL).append(sql`
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.embeddings_generated_at IS NOT NULL
          AND c.embeddings_generated_at > NOW() - INTERVAL '1 day' * ${TIER_1_AGE_DAYS}
      )
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.id > ${attemptCutoffId}
      )
    ORDER BY h.id, u.id ASC
  `)

  let total = 0
  await executeHandlerWithCursorInBatches<{
    id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }>(queryStatement, undefined, {
    batchSize: BATCH_SIZE,
    readOnly: true,
    handler: async rows => {
      total += rows.length
      await enqueueByHostname(rows)
    },
  })
  return total
}

/**
 * Dispatch Tier 2 URLs for crawling (every 30 days).
 * Tier 2: URLs referenced by entity relations with non-positive votes,
 * excluding URLs that are already Tier 1.
 */
export const dispatchTier2CrawlUrls = async (): Promise<number> => {
  const attemptCutoffId = getMinUUIDv7ForDate(
    new Date(Date.now() - ATTEMPT_THRESHOLD_HOURS * 60 * 60 * 1000),
  )
  const urlTables = getEntityRelationUrlTables()
  const urlTablesWithElections = getEntityRelationUrlTablesWithElections()
  const anyRelationExistsConditions = urlTables.map(
    table =>
      `EXISTS (
        SELECT 1 FROM "${table}" er
        WHERE er.object_id = u.id AND er.deleted_at IS NULL
      )`,
  )

  const tierCondition = `(
    (${anyRelationExistsConditions.join('\n    OR ')})
    AND NOT (${positiveVoteConditions(urlTablesWithElections).join('\n    OR ')})
    AND NOT EXISTS (
      SELECT 1 FROM user_profile_links upl WHERE upl.url_id = u.id
    )
  )`

  const queryStatement = sql`/* dispatchTier2CrawlUrls */
    SELECT u.id, h.id AS hostname_id, h.hostname, h.requests_per_second_limit
    FROM urls u
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE h.crawlable = true
      AND h.blocked = false
      AND `
  queryStatement
    .append(tierCondition)
    .append(sql`
      `)
    .append(HTML_CRAWL_EXCLUSIVITY_SQL).append(sql`
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.embeddings_generated_at IS NOT NULL
          AND c.embeddings_generated_at > NOW() - INTERVAL '1 day' * ${TIER_2_AGE_DAYS}
      )
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.id > ${attemptCutoffId}
      )
    ORDER BY h.id, u.id ASC
  `)

  let total = 0
  await executeHandlerWithCursorInBatches<{
    id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }>(queryStatement, undefined, {
    batchSize: BATCH_SIZE,
    readOnly: true,
    handler: async rows => {
      total += rows.length
      await enqueueByHostname(rows)
    },
  })
  return total
}
