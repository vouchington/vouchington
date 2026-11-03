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

type MediaDeliveryRegistryProcessorDependencies = {
  listRecoverableMediaDeliveryRegistryIds: typeof listRecoverableMediaDeliveryRegistryIds
  stageImagePlacementDeliveryRecordPage: typeof stageImagePlacementDeliveryRecordPage
  reconcileMediaDeliveryRepairMarkers: typeof reconcileMediaDeliveryRepairMarkers
  failExpiredExhaustedMediaDeliveryRegistryRecords: typeof failExpiredExhaustedMediaDeliveryRegistryRecords
  getMediaDeliveryRegistryScanBefore: typeof getMediaDeliveryRegistryScanBefore
}

export async function processApplyMediaDeliveryRegistryRecord(data: {
  mediaDeliveryRegistryRecordId: string
}): Promise<'completed' | 'not_claimed'> {
  return processMediaDeliveryRegistryRecord(data.mediaDeliveryRegistryRecordId)
}

export async function processReconcileMediaDeliveryRegistry(
  data: ReconcileMediaDeliveryRegistryData = {},
  dependencies: Partial<MediaDeliveryRegistryProcessorDependencies> = {},
): Promise<{ enqueued: number }> {
  const list =
    dependencies.listRecoverableMediaDeliveryRegistryIds ?? listRecoverableMediaDeliveryRegistryIds
  const pageSize = getMediaDeliverySafetyWorkLimit('recovery_page_size')
  const stage =
    dependencies.stageImagePlacementDeliveryRecordPage ?? stageImagePlacementDeliveryRecordPage
  const repair =
    dependencies.reconcileMediaDeliveryRepairMarkers ?? reconcileMediaDeliveryRepairMarkers
  if (!data.scanBefore) {
    if (!data.staging) await repair(pageSize)
    const staged = await stage(data.staging ?? {})
    if (staged.hasMore && staged.after) {
      await enqueueContinueMediaDeliveryRegistryStaging({
        scanBefore: staged.scanBefore,
        after: staged.after,
      })
    }
  }
  const cutoff =
    dependencies.getMediaDeliveryRegistryScanBefore ?? getMediaDeliveryRegistryScanBefore
  const fail =
    dependencies.failExpiredExhaustedMediaDeliveryRegistryRecords ??
    failExpiredExhaustedMediaDeliveryRegistryRecords
  const scanBefore = data.scanBefore ?? (await cutoff())
  // ast-grep-ignore: no-three-sequential-awaits -- terminal cleanup precedes primary discovery, then child acceptance precedes continuation
  await fail(scanBefore)
  const page = await list({ limit: pageSize, scanBefore, after: data.after })
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
  dependencies: { replay?: typeof replayFailedMediaDeliveryRegistryRecords } = {},
): Promise<void> {
  const page = await (dependencies.replay ?? replayFailedMediaDeliveryRegistryRecords)(data)
  if (page.hasMore && page.after)
    await enqueueReplayMediaDeliveryRegistry({
      actorUserId: data.actorUserId,
      after: page.after,
    })
}
