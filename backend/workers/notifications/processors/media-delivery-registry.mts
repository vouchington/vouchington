import { getMediaDeliverySafetyWorkLimit } from '@services/media-delivery-safety/work-limits'
import {
  enqueueReplayMediaDeliveryRegistry,
  type ReplayMediaDeliveryRegistryData,
  enqueueContinueMediaDeliveryRegistryStaging,
  enqueueBulkApplyMediaDeliveryRegistryRecords,
  enqueueContinueMediaDeliveryRegistryReconciliation,
  type ReconcileMediaDeliveryRegistryData,
} from '@queues/notifications/enqueues'
import {
  replayFailedMediaDeliveryRegistryRecords,
  listRecoverableMediaDeliveryRegistryIds,
  processMediaDeliveryRegistryRecord,
  stageImagePlacementDeliveryRecordPage,
  reconcileMediaDeliveryRepairMarkers,
  failExpiredExhaustedMediaDeliveryRegistryRecords,
  getMediaDeliveryRegistryScanBefore,
} from '@services/media-delivery-safety'

export async function processApplyMediaDeliveryRegistryRecord(data: {
  mediaDeliveryRegistryRecordId: string
}): Promise<'completed' | 'not_claimed'> {
  return processMediaDeliveryRegistryRecord(data.mediaDeliveryRegistryRecordId)
}

export async function processReconcileMediaDeliveryRegistry(
  data: ReconcileMediaDeliveryRegistryData = {},
  options: {
    recordIds?: readonly string[]
    imageIds?: readonly string[]
    scanBefore?: string
  } = {},
  batchSize?: number,
  stagingBatchSize?: number,
): Promise<{ enqueued: number }> {
  const pageSize = batchSize ?? getMediaDeliverySafetyWorkLimit('recovery_page_size')
  if (!data.scanBefore) {
    if (!data.staging) await reconcileMediaDeliveryRepairMarkers(pageSize, options.recordIds)
    const staged = await stageImagePlacementDeliveryRecordPage(
      { ...data.staging, imageIds: options.imageIds },
      stagingBatchSize,
    )
    if (staged.hasMore && staged.after) {
      await enqueueContinueMediaDeliveryRegistryStaging({
        scanBefore: staged.scanBefore,
        after: staged.after,
      })
    }
  }
  const scanBefore =
    data.scanBefore ?? options.scanBefore ?? (await getMediaDeliveryRegistryScanBefore())
  // ast-grep-ignore: no-three-sequential-awaits -- terminal cleanup precedes primary discovery, then child acceptance precedes continuation
  await failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, options.recordIds, batchSize)
  const page = await listRecoverableMediaDeliveryRegistryIds({
    limit: pageSize,
    scanBefore,
    after: data.after,
    recordIds: options.recordIds,
  })
  try {
    await enqueueBulkApplyMediaDeliveryRegistryRecords(page.results)
  } catch (err) {
    throw new AggregateError([err], 'Media delivery page enqueue failed', { cause: err })
  }
  if (page.page_info.has_next_page && page.page_info.end_cursor)
    await enqueueContinueMediaDeliveryRegistryReconciliation({
      scanBefore,
      after: page.page_info.end_cursor,
    })
  return { enqueued: page.results.length }
}

export async function processReplayMediaDeliveryRegistry(
  data: ReplayMediaDeliveryRegistryData,
  recordIds?: readonly string[],
  batchSize = getMediaDeliverySafetyWorkLimit('registry_reconciliation_page_size'),
): Promise<void> {
  const page = await replayFailedMediaDeliveryRegistryRecords({ ...data, recordIds }, batchSize)
  if (page.hasMore && page.after)
    await enqueueReplayMediaDeliveryRegistry({
      actorUserId: data.actorUserId,
      after: page.after,
    })
}
