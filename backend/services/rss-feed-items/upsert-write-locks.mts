import { getRssFeedItemsWorkLimit } from './work-limits.mts'
import type { RssFeedItemWithHash } from './upsert-prepare.mts'
import { upsertRssFeedItemIdentities } from './upsert-identities.mts'
import { chunkArray } from './processing-limits.mts'
import type { TransactionQuery } from '@data-stores/psql'

export type ResolvedRssFeedItemWrites = {
  identityIdsByGuid: Map<string, string>
  currentUrlIdsById: Map<string, string>
}

/**
 * Resolves each GUID to its identity id and reads the primary's current active item URLs.
 * Identity rows come from `INSERT ... ON CONFLICT DO NOTHING` on `(url_hostname_id, guid)`, which
 * makes concurrent resolvers agree on one id without a lock. Ascending GUID batches keep any
 * conflict wait on an uncommitted identity insert deadlock-free.
 */
export async function resolveRssFeedItemWrites(
  txQuery: TransactionQuery,
  urlHostnameId: string,
  items: RssFeedItemWithHash[],
): Promise<ResolvedRssFeedItemWrites> {
  const RSS_FEED_ITEM_SQL_BATCH_SIZE = getRssFeedItemsWorkLimit('sql_batch_size')
  const uniqueItems = new Map<string, RssFeedItemWithHash>()
  for (const item of items) uniqueItems.set(item.feedItem.guid, item)
  const orderedItems = [...uniqueItems.values()].toSorted(compareRssFeedItemGuids)
  const identityIdsByGuid = new Map<string, string>()
  for (const itemChunk of chunkArray(orderedItems, RSS_FEED_ITEM_SQL_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- ascending GUID batches keep identity conflict waits ordered.
    const identityRows = await upsertRssFeedItemIdentities(txQuery, urlHostnameId, itemChunk)
    for (const row of identityRows) identityIdsByGuid.set(row.guid, row.id)
  }
  const currentUrlIdsById = await readCurrentRssFeedItemUrlIds(txQuery, [
    ...identityIdsByGuid.values(),
  ])
  return { identityIdsByGuid, currentUrlIdsById }
}

function compareRssFeedItemGuids(left: RssFeedItemWithHash, right: RssFeedItemWithHash): number {
  return left.feedItem.guid.localeCompare(right.feedItem.guid)
}

/** Unlocked primary read: it only decides which replica-unchanged rows a writer revised. */
async function readCurrentRssFeedItemUrlIds(
  txQuery: TransactionQuery,
  rssFeedItemIds: string[],
): Promise<Map<string, string>> {
  const urlIdsById = new Map<string, string>()
  if (rssFeedItemIds.length === 0) return urlIdsById
  // One statement: the ids are this call's already bounded item set.
  const result = await txQuery<{ id: string; url_id: string }>(
    `/* upsertRssFeedItems:currentUrlIds */
      SELECT id, url_id
      FROM rss_feed_items
      WHERE id = ANY($1::uuid[])
        AND deleted_at IS NULL`,
    [rssFeedItemIds],
  )
  for (const row of result.rows) urlIdsById.set(row.id, row.url_id)
  return urlIdsById
}
