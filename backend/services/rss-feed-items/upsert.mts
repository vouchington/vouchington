import type { RssFeedItemToUpsert } from './types.mts'
import {
  buildExistingRssFeedItemsMap,
  getRevisedStoryIds,
  getRssFeedItemsToUpsert,
  upsertRssFeedItemContent,
  upsertRssFeedItemSources,
} from './upsert-queries.mts'
import {
  lockRssFeedItemWriteScopes,
  resolveAndLockRssFeedItemWrites,
} from './upsert-write-locks.mts'
import {
  enqueueMissingRssFeedItemEmbeddings,
  enqueueRssFeedItemCategorySnapshotReconciliationBestEffort,
} from './upsert-enqueues.mts'
import { prepareRssFeedItemsForUpsert } from './upsert-prepare.mts'
import { beginTransaction, read } from '@data-stores/psql'
import { enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort } from '@queues/story-post-related-url-projections/enqueues'
import { persistRssFeedItemCategorySnapshotReconciliations } from './category-snapshot-reconciliations.mts'
import { snapshotsForRssFeedItemRows } from './upsert-category-snapshot-reconciliations.mts'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { chunkArray, RSS_FEED_ITEM_SQL_BATCH_SIZE } from './processing-limits.mts'
import { recordPostPublicationChange } from '@services/post-publication'
import { buildRssFeedItemSourceInputs } from './upsert-sources.mts'
import {
  filterInsertedUnchangedSourceRows,
  orderUpsertedRowsByInput,
  sortRssFeedItemsByIdentityId,
  unchangedUnlinkedExistingRowsWithInsertedSources,
} from './upsert-ordering.mts'
import { finishRssFeedItemUpsert, finishUnchangedRssFeedItemUpsert } from './upsert-result.mts'
import { markStoryPostRelatedUrlProjectionsForStories } from './story-post-related-url-projections.mts'
import { getExistingRssFeedItems } from './upsert-existing.mts'

export type UpsertRssFeedItemsDependencies = {
  getExistingRssFeedItems?: typeof getExistingRssFeedItems
}

export async function upsertRssFeedItems(
  rssFeedId: string,
  feedItems: RssFeedItemToUpsert[],
  dependencies: UpsertRssFeedItemsDependencies = {},
) {
  assert(feedItems.length > 0, 400, 'feedItems is required')
  const [feedRow] = (
    await read(sql`/* upsertRssFeedItems:hostname */
    SELECT urls.hostname_id AS url_hostname_id,
           rss_feeds.is_enabled,
           rss_feeds.is_discoverable
    FROM rss_feeds
    JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
    WHERE rss_feeds.id = ${rssFeedId}
    LIMIT 1
  `)
  ).rows
  assert(feedRow, 404, 'RSS feed not found')
  const urlHostnameId = feedRow.url_hostname_id as string
  const isEligibleTopHashtagSource = feedRow.is_enabled === true && feedRow.is_discoverable === true
  const preparedItemsWithHashes = await prepareRssFeedItemsForUpsert(feedItems)
  const itemsByGuid = new Map<string, (typeof preparedItemsWithHashes)[number]>()
  for (const item of preparedItemsWithHashes) itemsByGuid.set(item.feedItem.guid, item)
  const itemsWithHashes = [...itemsByGuid.values()]
  if (itemsWithHashes.length === 0) return []
  const guids: string[] = []
  const feedItemsByGuid = new Map<string, (typeof itemsWithHashes)[number]['feedItem']>()
  for (const item of itemsWithHashes) {
    guids.push(item.feedItem.guid)
    feedItemsByGuid.set(item.feedItem.guid, item.feedItem)
  }
  const existingRows = await (dependencies.getExistingRssFeedItems ?? getExistingRssFeedItems)(
    rssFeedId,
    urlHostnameId,
    guids,
  )
  const existingMap = buildExistingRssFeedItemsMap(existingRows)
  const replicaItemsToUpsert = getRssFeedItemsToUpsert(itemsWithHashes, existingMap)
  const replicaGuidsToUpsert = new Set<string>()
  for (const item of replicaItemsToUpsert) replicaGuidsToUpsert.add(item.feedItem.guid)

  await using txQuery = await beginTransaction()
  await lockRssFeedItemWriteScopes(txQuery, rssFeedId)
  const resolved = await resolveAndLockRssFeedItemWrites(txQuery, urlHostnameId, itemsWithHashes)
  const writerRevisionItemsByGuid = new Map<string, (typeof itemsWithHashes)[number]>()
  for (const item of itemsWithHashes) {
    const { guid } = item.feedItem
    if (replicaGuidsToUpsert.has(guid)) continue
    const id = resolved.identityIdsByGuid.get(guid)
    const locked = id ? resolved.lockedRowsById.get(id) : undefined
    if (locked && locked.url_id !== item.url_id) writerRevisionItemsByGuid.set(guid, item)
  }
  const writerRevisionItems = [...writerRevisionItemsByGuid.values()]
  const itemsToUpsert = [...replicaItemsToUpsert, ...writerRevisionItems]
  const orderedItemsToUpsert = sortRssFeedItemsByIdentityId(
    itemsToUpsert,
    resolved.identityIdsByGuid,
  )
  const guidsToUpsert = new Set<string>()
  for (const item of itemsToUpsert) guidsToUpsert.add(item.feedItem.guid)
  const unchangedUnlinkedExistingRows: typeof existingRows = []
  for (const row of existingRows) {
    if (!row.is_linked_to_current_feed && !guidsToUpsert.has(row.guid)) {
      unchangedUnlinkedExistingRows.push(row)
    }
  }
  const unchangedUnlinkedSourceRows = buildRssFeedItemSourceInputs(
    unchangedUnlinkedExistingRows,
    feedItemsByGuid,
  )
  const identityRows: Array<{ guid: string; id: string }> = []
  for (const [guid, id] of resolved.identityIdsByGuid.entries()) identityRows.push({ guid, id })
  const rows: Awaited<ReturnType<typeof upsertRssFeedItemContent>> = []
  for (const chunk of chunkArray(orderedItemsToUpsert, RSS_FEED_ITEM_SQL_BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop -- sequential content chunks retain the transaction's canonical key order.
    rows.push(...(await upsertRssFeedItemContent(txQuery, identityRows, chunk)))
  }
  const changedSourceRows = buildRssFeedItemSourceInputs(rows, feedItemsByGuid)
  // ast-grep-ignore: no-three-sequential-awaits -- source rows, projection restart, and category snapshots share one transaction.
  const insertedSourceRows = await upsertRssFeedItemSources(txQuery, rssFeedId, [
    ...unchangedUnlinkedSourceRows,
    ...changedSourceRows,
  ])
  const markedStoryPostRelatedUrlProjections = await markStoryPostRelatedUrlProjectionsForStories(
    txQuery,
    getRevisedStoryIds(resolved.lockedRowsById.values(), rows),
  )
  await persistRssFeedItemCategorySnapshotReconciliations(
    txQuery,
    rssFeedId,
    snapshotsForRssFeedItemRows(itemsWithHashes, [
      ...rows,
      ...unchangedUnlinkedExistingRowsWithInsertedSources(
        unchangedUnlinkedExistingRows,
        insertedSourceRows,
      ),
    ]),
  )
  if (insertedSourceRows.length > 0) {
    await recordPostPublicationChange(txQuery, {
      scope: { type: 'rss_feed', rssFeedId },
      reason: 'rss_feed_source_changed',
      impactedRssFeedItemIds: insertedRssFeedItemIds(insertedSourceRows),
    })
  }
  await txQuery.commit()
  if (markedStoryPostRelatedUrlProjections)
    void enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort()
  if (itemsToUpsert.length === 0) {
    if (unchangedUnlinkedExistingRows.length > 0) {
      void enqueueRssFeedItemCategorySnapshotReconciliationBestEffort()
      await finishUnchangedRssFeedItemUpsert(
        isEligibleTopHashtagSource,
        existingRows,
        unchangedUnlinkedExistingRows,
        insertedSourceRows,
      )
    } else {
      await enqueueMissingRssFeedItemEmbeddings(existingRows)
    }
    return []
  }
  const insertedUnchangedSourceRows = filterInsertedUnchangedSourceRows(
    insertedSourceRows,
    unchangedUnlinkedExistingRows,
  )
  const upsertedRows = orderUpsertedRowsByInput(itemsToUpsert, rows)
  return finishRssFeedItemUpsert(
    isEligibleTopHashtagSource,
    itemsToUpsert,
    existingRows,
    unchangedUnlinkedExistingRows,
    insertedUnchangedSourceRows,
    upsertedRows,
  )
}

function insertedRssFeedItemIds(insertedSourceRows: Array<{ rss_feed_item_id: string }>): string[] {
  const ids: string[] = []
  for (const row of insertedSourceRows) ids.push(row.rss_feed_item_id)
  return ids
}
