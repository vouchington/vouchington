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

const TIER_1_AGE_DAYS = 7
const TIER_2_AGE_DAYS = 30
const ATTEMPT_THRESHOLD_HOURS = 1

/**
 * Dispatch Tier 1 URLs for crawling (every 7 days).
 * Tier 1: URLs referenced by entity relations with positive votes,
 * or user profile links.
 */
export const dispatchTier1CrawlUrls = (
  cursor?: CrawlDispatchCursor,
  saveProgress?: (cursor: CrawlDispatchCursor) => Promise<void>,
) => dispatchTierCrawlUrls(1, cursor, saveProgress)

/** Dispatch non-positive relation URLs outside Tier 1, with the 30-day eligibility cutoff. */
export const dispatchTier2CrawlUrls = (
  cursor?: CrawlDispatchCursor,
  saveProgress?: (cursor: CrawlDispatchCursor) => Promise<void>,
) => dispatchTierCrawlUrls(2, cursor, saveProgress)

async function dispatchTierCrawlUrls(
  tier: 1 | 2,
  cursor?: CrawlDispatchCursor,
  saveProgress?: (cursor: CrawlDispatchCursor) => Promise<void>,
) {
  const limits = getCrawlDispatchLimits()
  const sweepStartedAt = cursor?.sweepStartedAt ?? new Date().toISOString()
  await saveProgress?.({ sweepStartedAt, ...(cursor?.afterId && { afterId: cursor.afterId }) })
  const upperId = getMinUUIDv7ForDate(new Date(sweepStartedAt))
  const attemptCutoffId = getMinUUIDv7ForDate(
    new Date(new Date(sweepStartedAt).getTime() - ATTEMPT_THRESHOLD_HOURS * 60 * 60 * 1000),
  )
  const queryStatement = sql`/* dispatchTierCrawlUrls */ `
  queryStatement.append(buildTierWorkCandidates(tier === 1, upperId, cursor?.afterId)).append(sql`
    SELECT u.id, h.id AS hostname_id, h.hostname, h.requests_per_second_limit
    FROM eligible_urls work
    JOIN urls u ON u.id = work.url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE h.crawlable = true
      AND h.blocked = false
      `)
  if (tier === 2) {
    const positive = positiveVoteConditions(getEntityRelationUrlTablesWithElections()).join(' OR ')
    queryStatement.append(`AND NOT (${positive}) AND NOT EXISTS (
      SELECT 1 FROM user_profile_links upl WHERE upl.url_id = u.id
    ) `)
  }
  queryStatement.append(HTML_CRAWL_EXCLUSIVITY_SQL).append(sql`
      AND NOT EXISTS (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.embeddings_generated_at IS NOT NULL
          AND c.embeddings_generated_at > ${sweepStartedAt}::timestamptz - INTERVAL '1 day' * ${tier === 1 ? TIER_1_AGE_DAYS : TIER_2_AGE_DAYS}
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
      await saveProgress?.({ sweepStartedAt, afterId: rows.at(-1)!.id })
    },
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
