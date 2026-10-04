import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import {
  getEntityRelationUrlTables,
  getEntityRelationUrlTablesWithElections,
  positiveVoteConditions,
} from '@services/entity-relations'
import { HTML_CRAWL_EXCLUSIVITY_SQL } from './html-crawl-eligibility-sql.mts'

import { getCrawlDispatchLimits } from './work-limits.mts'
import { enqueueByHostname } from './dispatch-url-batches.mts'
import type { CrawlDispatchCursor } from '@queues/crawl-hostnames/types'
import { enqueueCrawlDispatchContinuation } from '@queues/crawl-hostnames/enqueues'

const TIER_1_AGE_DAYS = 7
const TIER_2_AGE_DAYS = 30
const ATTEMPT_THRESHOLD_HOURS = 1

/**
 * Dispatch Tier 1 URLs for crawling (every 7 days).
 * Tier 1: URLs referenced by entity relations with positive votes,
 * or user profile links.
 */
export const dispatchTier1CrawlUrls = async (cursor?: CrawlDispatchCursor) => {
  const limits = getCrawlDispatchLimits()
  const sweepStartedAt = cursor?.sweepStartedAt ?? new Date().toISOString()
  const upperId = getMinUUIDv7ForDate(new Date(sweepStartedAt))
  const attemptCutoffId = getMinUUIDv7ForDate(
    new Date(new Date(sweepStartedAt).getTime() - ATTEMPT_THRESHOLD_HOURS * 60 * 60 * 1000),
  )
  const queryStatement = sql`/* dispatchTier1CrawlUrls */ `
  queryStatement.append(buildTierWorkCandidates(true, upperId, cursor?.afterId)).append(sql`
    SELECT u.id, h.id AS hostname_id, h.hostname, h.requests_per_second_limit
    FROM eligible_urls work
    JOIN urls u ON u.id = work.url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE h.crawlable = true
      AND h.blocked = false
      `)
  queryStatement.append(HTML_CRAWL_EXCLUSIVITY_SQL).append(sql`
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.embeddings_generated_at IS NOT NULL
          AND c.embeddings_generated_at > ${sweepStartedAt}::timestamptz - INTERVAL '1 day' * ${TIER_1_AGE_DAYS}
      )
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.id > ${attemptCutoffId}
      )
    ORDER BY u.id ASC
  `)

  let total = 0
  const result = await executeHandlerWithCursorInBatches<{
    id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }>(queryStatement, undefined, {
    batchSize: limits.batchSize,
    maxRows: limits.maxRows,
    readOnly: true,
    handler: async rows => {
      total += rows.length
      await enqueueByHostname(rows)
    },
  })
  if (result.hasMore && result.lastRow)
    await enqueueCrawlDispatchContinuation('crawl_tier1_dispatcher', {
      cursor: { sweepStartedAt, afterId: result.lastRow.id },
    })
  return { count: total, hasMore: result.hasMore }
}

/**
 * Dispatch Tier 2 URLs for crawling (every 30 days).
 * Tier 2: URLs referenced by entity relations with non-positive votes,
 * excluding URLs that are already Tier 1.
 */
export const dispatchTier2CrawlUrls = async (cursor?: CrawlDispatchCursor) => {
  const limits = getCrawlDispatchLimits()
  const sweepStartedAt = cursor?.sweepStartedAt ?? new Date().toISOString()
  const upperId = getMinUUIDv7ForDate(new Date(sweepStartedAt))
  const attemptCutoffId = getMinUUIDv7ForDate(
    new Date(new Date(sweepStartedAt).getTime() - ATTEMPT_THRESHOLD_HOURS * 60 * 60 * 1000),
  )
  const urlTablesWithElections = getEntityRelationUrlTablesWithElections()
  const tierCondition = `(
    NOT (${positiveVoteConditions(urlTablesWithElections).join('\n    OR ')})
    AND NOT EXISTS (
      SELECT 1 FROM user_profile_links upl WHERE upl.url_id = u.id
    )
  )`

  const queryStatement = sql`/* dispatchTier2CrawlUrls */ `
  queryStatement.append(buildTierWorkCandidates(false, upperId, cursor?.afterId)).append(sql`
    SELECT u.id, h.id AS hostname_id, h.hostname, h.requests_per_second_limit
    FROM eligible_urls work
    JOIN urls u ON u.id = work.url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE h.crawlable = true
      AND h.blocked = false
      AND `)
  queryStatement
    .append(tierCondition)
    .append(sql`
      `)
    .append(HTML_CRAWL_EXCLUSIVITY_SQL).append(sql`
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.embeddings_generated_at IS NOT NULL
          AND c.embeddings_generated_at > ${sweepStartedAt}::timestamptz - INTERVAL '1 day' * ${TIER_2_AGE_DAYS}
      )
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.id > ${attemptCutoffId}
      )
    ORDER BY u.id ASC
  `)

  let total = 0
  const result = await executeHandlerWithCursorInBatches<{
    id: string
    hostname_id: string
    hostname: string
    requests_per_second_limit: number | null
  }>(queryStatement, undefined, {
    batchSize: limits.batchSize,
    maxRows: limits.maxRows,
    readOnly: true,
    handler: async rows => {
      total += rows.length
      await enqueueByHostname(rows)
    },
  })
  if (result.hasMore && result.lastRow)
    await enqueueCrawlDispatchContinuation('crawl_tier2_dispatcher', {
      cursor: { sweepStartedAt, afterId: result.lastRow.id },
    })
  return { count: total, hasMore: result.hasMore }
}

function buildTierWorkCandidates(positiveOnly: boolean, upperId: string, afterId?: string) {
  const tables = positiveOnly
    ? getEntityRelationUrlTablesWithElections()
    : getEntityRelationUrlTables()
  const sources = tables.map(table => ({
    text: `SELECT object_id AS url_id FROM "${table}" WHERE deleted_at IS NULL${positiveOnly ? ' AND votes_score_net > 0' : ''}`,
    column: 'object_id',
  }))
  if (positiveOnly)
    sources.push({
      text: 'SELECT url_id FROM user_profile_links WHERE url_id IS NOT NULL',
      column: 'url_id',
    })
  const statement = sql`WITH eligible_urls AS (`
  for (const [index, source] of sources.entries()) {
    if (index > 0) statement.append(' UNION ')
    statement
      .append(source.text)
      .append(` AND ${source.column} < `)
      .append(sql`${upperId}::uuid`)
    if (afterId) statement.append(` AND ${source.column} > `).append(sql`${afterId}::uuid`)
  }
  return statement.append(') ')
}
