import { write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import sql from 'sql-template-strings'

export const RSS_FEED_ITEM_SOURCE_PUBLICATION_BACKFILL_BATCH_SIZE = 500
export const RSS_FEED_ITEM_SOURCE_PUBLICATION_BACKFILL_MAX_BATCH_SIZE = 1_000

/**
 * Restrict an operational backfill run to an independently retryable feed shard.
 * `rssFeedItemIds` narrows an owned chunk for tests and targeted recovery; the CLI exposes feed
 * shards as the stable operator interface.
 */
export type RssFeedItemSourcePublicationBackfillScope = {
  rssFeedId?: string
  rssFeedItemIds?: string[]
}

export async function backfillRssFeedItemSourcePublications(
  batchSize = RSS_FEED_ITEM_SOURCE_PUBLICATION_BACKFILL_BATCH_SIZE,
  scope?: RssFeedItemSourcePublicationBackfillScope,
): Promise<number> {
  assertRssFeedItemSourcePublicationBackfillBatchSize(batchSize)
  const scopeCondition = buildBackfillScopeCondition(scope)
  const query = sql`/* backfillRssFeedItemSourcePublications */
    WITH candidates AS MATERIALIZED (
      SELECT source.rss_feed_id, source.rss_feed_item_id
      FROM rss_feed_item_sources source
      WHERE source.published_at IS NULL
  `
  query.append(scopeCondition)
  query.append(sql`
      ORDER BY source.rss_feed_id, source.rss_feed_item_id
      LIMIT ${batchSize}
      FOR UPDATE OF source SKIP LOCKED
    )
    UPDATE rss_feed_item_sources source
    SET published_at = item.published_at
    FROM candidates
    JOIN rss_feed_items item ON item.id = candidates.rss_feed_item_id
    WHERE source.rss_feed_id = candidates.rss_feed_id
      AND source.rss_feed_item_id = candidates.rss_feed_item_id
  `)
  const { rowCount } = await write(query)
  return rowCount ?? 0
}

export async function hasRssFeedItemSourcesMissingPublication(
  scope?: RssFeedItemSourcePublicationBackfillScope,
): Promise<boolean> {
  const scopeCondition = buildBackfillScopeCondition(scope)
  const query = sql`/* hasRssFeedItemSourcesMissingPublication */
    SELECT EXISTS (
      SELECT 1
      FROM rss_feed_item_sources source
      WHERE source.published_at IS NULL
  `
  query.append(scopeCondition)
  query.append(sql`
    ) AS has_missing
  `)
  const { rows } = await write<{ has_missing: boolean }>(query)
  return rows[0]?.has_missing ?? false
}

export function assertRssFeedItemSourcePublicationBackfillBatchSize(batchSize: number): void {
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > RSS_FEED_ITEM_SOURCE_PUBLICATION_BACKFILL_MAX_BATCH_SIZE
  ) {
    throw new Error(
      `batchSize must be an integer from 1 through ${RSS_FEED_ITEM_SOURCE_PUBLICATION_BACKFILL_MAX_BATCH_SIZE}`,
    )
  }
}

function buildBackfillScopeCondition(scope?: RssFeedItemSourcePublicationBackfillScope) {
  const condition = sql``
  if (scope?.rssFeedId !== undefined) {
    if (!isUUID(scope.rssFeedId)) throw new Error('rssFeedId must be a valid UUID')
    condition.append(sql` AND source.rss_feed_id = ${scope.rssFeedId}`)
  }
  if (scope?.rssFeedItemIds !== undefined) {
    if (scope.rssFeedItemIds.length === 0) {
      throw new Error('rssFeedItemIds must not be empty when scoping a source-publication backfill')
    }
    if (!scope.rssFeedItemIds.every(rssFeedItemId => isUUID(rssFeedItemId))) {
      throw new Error('rssFeedItemIds must contain only valid UUIDs')
    }
    condition.append(sql` AND source.rss_feed_item_id = ANY(${scope.rssFeedItemIds}::uuid[])`)
  }
  return condition
}
