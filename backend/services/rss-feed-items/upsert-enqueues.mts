import { enqueueBulkCreateRssFeedItemEmbeddings } from '@queues/bedrock-embeddings/enqueues'
import { enqueueBulkAutotaggerRssFeedItems } from '@queues/ai-agents/enqueues/autotagger'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'
import { normalizeKey } from '@ts-shared/utils/strings'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache'
import { enqueueBulkReconcileRssFeedItemNotifications } from '@queues/notifications/enqueues'
import { enqueueReconcileRssFeedItemCategorySnapshots } from '@queues/rss-feed-item-categories/enqueues'
import type { RssFeedItemWithHash } from './upsert-prepare.mts'
import type { ExistingRssFeedItemRow, UpsertedRssFeedItemRow } from './upsert-queries.mts'
import { chunkArray, RSS_FEED_ITEM_ENQUEUE_BATCH_SIZE } from './processing-limits.mts'
import onError from '@modules/on-error'

type RssFeedItemEnqueueRow = Pick<
  ExistingRssFeedItemRow | UpsertedRssFeedItemRow,
  'id' | 'guid' | 'has_embedding'
>

export const enqueueMissingRssFeedItemEmbeddings = async (
  rows: Array<Pick<RssFeedItemEnqueueRow, 'id' | 'has_embedding'>>,
) => {
  const itemsMissingEmbeddings = rows.filter(row => !row.has_embedding)
  if (itemsMissingEmbeddings.length === 0) return

  await enqueueBulkCreateRssFeedItemEmbeddingsInChunks(
    itemsMissingEmbeddings.map(row => ({ rss_feed_item_id: row.id })),
  )
}

export async function enqueueRssFeedItemCategorySnapshotReconciliationBestEffort(): Promise<void> {
  try {
    await enqueueReconcileRssFeedItemCategorySnapshots()
  } catch {
    // createEnqueueFunction reports terminal rejection; the durable row is schedule-replayed.
  }
}

export const enqueueRssFeedItemPostUpsertJobs = async (
  itemsToUpsert: RssFeedItemWithHash[],
  existingRows: RssFeedItemEnqueueRow[],
  upsertedRows: UpsertedRssFeedItemRow[],
  options: {
    existingRowsForFanout?: RssFeedItemEnqueueRow[]
    languageDetectionRows?: RssFeedItemEnqueueRow[]
  } = {},
) => {
  const allRowsWithGuids = mergeRssFeedItemRows(itemsToUpsert, existingRows, upsertedRows)
  const fanoutRowsWithGuids = mergeRssFeedItemRows(
    itemsToUpsert,
    options.existingRowsForFanout ?? existingRows,
    upsertedRows,
  )
  entityCacheBloomFilters.rss_feed_items.add(fanoutRowsWithGuids.map(row => normalizeKey(row.id)))
  await Promise.all([
    enqueueEmbeddingsAndAutotagger(fanoutRowsWithGuids),
    invalidateRssFeedItemsInChunks(fanoutRowsWithGuids.map(row => row.id)),
    enqueueRssFeedItemNotificationReconciliationInChunks(fanoutRowsWithGuids.map(row => row.id)),
  ])
  void enqueueRssFeedItemLanguageDetection(options.languageDetectionRows ?? upsertedRows)

  return allRowsWithGuids.map(row => ({
    id: row.id,
    has_embedding: row.has_embedding,
  }))
}

function mergeRssFeedItemRows(
  itemsToUpsert: RssFeedItemWithHash[],
  existingRows: RssFeedItemEnqueueRow[],
  upsertedRows: UpsertedRssFeedItemRow[],
) {
  const upsertedGuids = new Set(itemsToUpsert.map(item => item.feedItem.guid))
  const unchangedRows = existingRows.flatMap(row =>
    upsertedGuids.has(row.guid)
      ? []
      : [{ id: row.id, guid: row.guid, has_embedding: row.has_embedding }],
  )

  return [...unchangedRows, ...upsertedRows]
}

async function enqueueEmbeddingsAndAutotagger(rows: RssFeedItemEnqueueRow[]) {
  const itemsMissingEmbeddings = rows.filter(row => !row.has_embedding)
  if (itemsMissingEmbeddings.length === 0) return

  const jobs = itemsMissingEmbeddings.map(row => ({ rss_feed_item_id: row.id }))
  await Promise.all([
    enqueueBulkCreateRssFeedItemEmbeddingsInChunks(jobs),
    enqueueBulkAutotaggerRssFeedItemsInChunks(jobs),
  ])
}

async function enqueueBulkCreateRssFeedItemEmbeddingsInChunks(
  jobs: Array<{ rss_feed_item_id: string }>,
) {
  await enqueueChunks(jobs, enqueueBulkCreateRssFeedItemEmbeddings)
}

async function enqueueBulkAutotaggerRssFeedItemsInChunks(
  jobs: Array<{ rss_feed_item_id: string }>,
) {
  await enqueueChunks(jobs, enqueueBulkAutotaggerRssFeedItems)
}

async function enqueueRssFeedItemNotificationReconciliationInChunks(rssFeedItemIds: string[]) {
  await enqueueChunks(rssFeedItemIds, enqueueBulkReconcileRssFeedItemNotifications)
}

async function invalidateRssFeedItemsInChunks(rssFeedItemIds: string[]) {
  await enqueueChunks(rssFeedItemIds, async chunk => invalidate.rss_feed_items(...chunk))
}

async function enqueueRssFeedItemLanguageDetection(rows: RssFeedItemEnqueueRow[]) {
  for (const row of rows) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Sequential enqueues limit queue fanout pressure.
      await enqueueLanguageDetection('rss_feed_item', row.id)
    } catch (error) {
      onError(toError(error))
    }
  }
}

async function enqueueChunks<T>(items: T[], enqueue: (chunk: T[]) => unknown | Promise<unknown>) {
  for (const chunk of chunkArray(items, RSS_FEED_ITEM_ENQUEUE_BATCH_SIZE)) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Sequential chunks limit queue fanout pressure.
      await enqueue(chunk)
    } catch (error) {
      onError(toError(error))
    }
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error), { cause: error })
}
