import { enqueueTopHashtagRefreshIfNeeded } from './upsert-top-hashtags.mts'
import {
  enqueueMissingRssFeedItemEmbeddings,
  enqueueRssFeedItemCategorySnapshotReconciliationBestEffort,
  enqueueRssFeedItemPostUpsertJobs,
} from './upsert-enqueues.mts'
import type { ExistingRssFeedItemRow, UpsertedRssFeedItemRow } from './upsert-queries.mts'
import type { RssFeedItemWithHash } from './upsert-prepare.mts'

export async function finishRssFeedItemUpsert(
  isEligibleTopHashtagSource: boolean,
  itemsToUpsert: RssFeedItemWithHash[],
  existingRows: ExistingRssFeedItemRow[],
  unchangedUnlinkedExistingRows: ExistingRssFeedItemRow[],
  insertedUnchangedSourceRows: Array<{ rss_feed_item_id: string }>,
  upsertedRows: UpsertedRssFeedItemRow[],
  notificationChangeId: string,
) {
  void enqueueRssFeedItemCategorySnapshotReconciliationBestEffort()
  enqueueTopHashtagRefreshIfNeeded(
    isEligibleTopHashtagSource,
    existingRows,
    insertedUnchangedSourceRows,
    upsertedRows,
  )
  return enqueueRssFeedItemPostUpsertJobs(
    itemsToUpsert,
    existingRows,
    upsertedRows,
    notificationChangeId,
    {
      existingRowsForFanout: unchangedUnlinkedExistingRows,
      languageDetectionRows: [...upsertedRows, ...unchangedUnlinkedExistingRows],
    },
  )
}

export async function finishUnchangedRssFeedItemUpsert(
  isEligibleTopHashtagSource: boolean,
  existingRows: ExistingRssFeedItemRow[],
  unchangedUnlinkedExistingRows: ExistingRssFeedItemRow[],
  insertedSourceRows: Array<{ rss_feed_item_id: string }>,
  notificationChangeId: string,
): Promise<void> {
  enqueueTopHashtagRefreshIfNeeded(
    isEligibleTopHashtagSource,
    unchangedUnlinkedExistingRows,
    insertedSourceRows,
    [],
  )
  await enqueueRssFeedItemPostUpsertJobs(
    [],
    unchangedUnlinkedExistingRows,
    [],
    notificationChangeId,
    {
      languageDetectionRows: unchangedUnlinkedExistingRows,
    },
  )
  await enqueueMissingRssFeedItemEmbeddings(
    existingRows.filter(row => row.is_linked_to_current_feed),
  )
}
