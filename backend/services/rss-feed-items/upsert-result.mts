import { enqueueTopHashtagRefreshIfNeeded } from './upsert-top-hashtags.mts'
import {
  enqueueMissingRssFeedItemEmbeddings,
  enqueueRssFeedItemLanguageDetection,
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
  languageUnchangedRows: ExistingRssFeedItemRow[],
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
      languageDetectionRows: [...upsertedRows, ...languageUnchangedRows],
    },
  )
}

export async function finishUnchangedRssFeedItemUpsert(
  isEligibleTopHashtagSource: boolean,
  existingRows: ExistingRssFeedItemRow[],
  unchangedUnlinkedExistingRows: ExistingRssFeedItemRow[],
  insertedSourceRows: Array<{ rss_feed_item_id: string }>,
  notificationChangeId: string,
  languageUnchangedRows: ExistingRssFeedItemRow[],
): Promise<void> {
  if (unchangedUnlinkedExistingRows.length === 0) {
    await enqueueMissingRssFeedItemEmbeddings(existingRows)
    await enqueueRssFeedItemLanguageDetection(languageUnchangedRows)
    return
  }
  void enqueueRssFeedItemCategorySnapshotReconciliationBestEffort()
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
      languageDetectionRows: languageUnchangedRows,
    },
  )
  await enqueueMissingRssFeedItemEmbeddings(
    existingRows.filter(row => row.is_linked_to_current_feed),
  )
}
