import type { RssFeedItemWithHash } from './upsert-prepare.mts'
import { upsertRssFeedItemIdentities } from './upsert-identities.mts'
import { chunkArray, RSS_FEED_ITEM_SQL_BATCH_SIZE } from './processing-limits.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { lockPostPublicationRssFeedScopes } from '@services/post-publication/capture-rss-feeds'

export type LockedRssFeedItemRow = {
  id: string
  url_id: string
  story_id: string | null
}

export type ResolvedRssFeedItemWrites = {
  identityGuidsById: Map<string, string>
  identityIdsByGuid: Map<string, string>
  lockedRowsById: Map<string, LockedRssFeedItemRow>
}

export async function lockRssFeedItemWriteScopes(
  txQuery: TransactionQuery,
  rssFeedId: string,
): Promise<void> {
  await lockPostPublicationRssFeedScopes(txQuery, [rssFeedId])
  await txQuery(
    `/* upsertRssFeedItems:lockSources */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [rssFeedId],
  )
}

export async function resolveAndLockRssFeedItemWrites(
  txQuery: TransactionQuery,
  urlHostnameId: string,
  items: RssFeedItemWithHash[],
): Promise<ResolvedRssFeedItemWrites> {
  const uniqueItems = new Map<string, RssFeedItemWithHash>()
  for (const item of items) uniqueItems.set(item.feedItem.guid, item)
  const orderedItems = [...uniqueItems.values()].toSorted(compareRssFeedItemGuids)
  const orderedGuids = rssFeedItemGuids(orderedItems)
  const existingIdentityRows = await lockRssFeedItemIdentities(txQuery, urlHostnameId, orderedGuids)
  const existingGuids = new Set<string>()
  for (const row of existingIdentityRows) existingGuids.add(row.guid)
  const newItems: RssFeedItemWithHash[] = []
  for (const item of orderedItems) {
    if (!existingGuids.has(item.feedItem.guid)) newItems.push(item)
  }
  for (const itemChunk of chunkArray(newItems, RSS_FEED_ITEM_SQL_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- ascending GUID batches preserve global identity lock order.
    await upsertRssFeedItemIdentities(txQuery, urlHostnameId, itemChunk)
  }
  const identityRows = await lockRssFeedItemIdentities(txQuery, urlHostnameId, orderedGuids)
  const identityIds: string[] = []
  for (const row of identityRows) identityIds.push(row.id)
  const lockedRows = await lockRssFeedItemsForUpsert(txQuery, identityIds)
  const identityGuidsById = new Map<string, string>()
  const identityIdsByGuid = new Map<string, string>()
  for (const row of identityRows) {
    identityGuidsById.set(row.id, row.guid)
    identityIdsByGuid.set(row.guid, row.id)
  }
  const lockedRowsById = new Map<string, LockedRssFeedItemRow>()
  for (const row of lockedRows) lockedRowsById.set(row.id, row)
  return { identityGuidsById, identityIdsByGuid, lockedRowsById }
}

function compareRssFeedItemGuids(left: RssFeedItemWithHash, right: RssFeedItemWithHash): number {
  return left.feedItem.guid.localeCompare(right.feedItem.guid)
}

function rssFeedItemGuids(items: RssFeedItemWithHash[]): string[] {
  const guids: string[] = []
  for (const item of items) guids.push(item.feedItem.guid)
  return guids
}

async function lockRssFeedItemIdentities(
  txQuery: TransactionQuery,
  urlHostnameId: string,
  guids: string[],
): Promise<Array<{ id: string; guid: string }>> {
  const rows: Array<{ id: string; guid: string }> = []
  for (const guidChunk of chunkArray(guids, RSS_FEED_ITEM_SQL_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- ascending GUID batches preserve global identity lock order.
    const result = await txQuery<{ id: string; guid: string }>(
      `/* upsertRssFeedItems:lockIdentities */
        SELECT id, guid
        FROM rss_feed_item_ids
        WHERE url_hostname_id = $1
          AND guid = ANY($2::text[])
        ORDER BY guid
        FOR UPDATE`,
      [urlHostnameId, guidChunk],
    )
    rows.push(...result.rows)
  }
  return rows
}

async function lockRssFeedItemsForUpsert(
  txQuery: TransactionQuery,
  rssFeedItemIds: string[],
): Promise<LockedRssFeedItemRow[]> {
  const orderedIds = [...new Set(rssFeedItemIds)].toSorted()
  if (orderedIds.length === 0) return []
  const rows: LockedRssFeedItemRow[] = []
  for (const ids of chunkArray(orderedIds, RSS_FEED_ITEM_SQL_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- ascending bounded batches preserve global item lock order.
    const result = await txQuery<LockedRssFeedItemRow>(
      `/* upsertRssFeedItems:lockExistingForUrlRevision */
        SELECT id, url_id, story_id
        FROM rss_feed_items
        WHERE id = ANY($1::uuid[])
          AND deleted_at IS NULL
        ORDER BY id
        FOR UPDATE`,
      [ids],
    )
    rows.push(...result.rows)
  }
  return rows
}
