import {
  enqueueApplyMediaDeliveryRegistryRecord,
  enqueueContinueMediaDeliveryRegistryReconciliation,
  type ReconcileMediaDeliveryRegistryData,
} from '@queues/notifications/enqueues'
import {
  listRecoverableMediaDeliveryRegistryKeys,
  processMediaDeliveryRegistryRecord,
  stageAllCurrentImagePlacementDeliveryRecords,
  reconcileMediaDeliveryRepairMarkers,
  failExpiredExhaustedMediaDeliveryRegistryRecords,
  getMediaDeliveryRegistryScanBefore,
} from '@services/media-delivery-safety'

type MediaDeliveryRegistryProcessorDependencies = {
  enqueueApplyMediaDeliveryRegistryRecord: typeof enqueueApplyMediaDeliveryRegistryRecord
  listRecoverableMediaDeliveryRegistryKeys: typeof listRecoverableMediaDeliveryRegistryKeys
  processMediaDeliveryRegistryRecord: typeof processMediaDeliveryRegistryRecord
  stageAllCurrentImagePlacementDeliveryRecords: typeof stageAllCurrentImagePlacementDeliveryRecords
  reconcileMediaDeliveryRepairMarkers: typeof reconcileMediaDeliveryRepairMarkers
  now: () => Date
  enqueueContinueMediaDeliveryRegistryReconciliation: typeof enqueueContinueMediaDeliveryRegistryReconciliation
  failExpiredExhaustedMediaDeliveryRegistryRecords: typeof failExpiredExhaustedMediaDeliveryRegistryRecords
  getMediaDeliveryRegistryScanBefore: typeof getMediaDeliveryRegistryScanBefore
}

export async function processApplyMediaDeliveryRegistryRecord(
  data: { deliveryKey: string },
  dependencies: Partial<MediaDeliveryRegistryProcessorDependencies> = {},
): Promise<'completed' | 'not_claimed'> {
  const process =
    dependencies.processMediaDeliveryRegistryRecord ?? processMediaDeliveryRegistryRecord
  const now = dependencies.now ?? (() => new Date())
  return process(data.deliveryKey, now())
}

export async function processReconcileMediaDeliveryRegistry(
  data: ReconcileMediaDeliveryRegistryData = {},
  dependencies: Partial<MediaDeliveryRegistryProcessorDependencies> = {},
): Promise<{ enqueued: number }> {
  const list =
    dependencies.listRecoverableMediaDeliveryRegistryKeys ??
    listRecoverableMediaDeliveryRegistryKeys
  const enqueue =
    dependencies.enqueueApplyMediaDeliveryRegistryRecord ?? enqueueApplyMediaDeliveryRegistryRecord
  const stage =
    dependencies.stageAllCurrentImagePlacementDeliveryRecords ??
    stageAllCurrentImagePlacementDeliveryRecords
  const repair =
    dependencies.reconcileMediaDeliveryRepairMarkers ?? reconcileMediaDeliveryRepairMarkers
  if (!data.scanBefore) {
    await repair(100)
    await stage()
  }
  const cutoff =
    dependencies.getMediaDeliveryRegistryScanBefore ?? getMediaDeliveryRegistryScanBefore
  const fail =
    dependencies.failExpiredExhaustedMediaDeliveryRegistryRecords ??
    failExpiredExhaustedMediaDeliveryRegistryRecords
  const continuation =
    dependencies.enqueueContinueMediaDeliveryRegistryReconciliation ??
    enqueueContinueMediaDeliveryRegistryReconciliation
  const scanBefore = data.scanBefore ?? (await cutoff())
  // ast-grep-ignore: no-three-sequential-awaits -- terminal cleanup precedes primary discovery, then child acceptance precedes continuation
  await fail(scanBefore)
  const page = await list({ limit: 100, scanBefore, after: data.after })
  const accepted = await Promise.allSettled(page.results.map(deliveryKey => enqueue(deliveryKey)))
  const failures = accepted.filter(result => result.status === 'rejected')
  if (failures.length)
    throw new AggregateError(
      failures.map(result => result.reason),
      'Media delivery page enqueue failed',
    )
  if (page.page_info.has_next_page && page.page_info.end_cursor)
    await continuation({ scanBefore, after: page.page_info.end_cursor })
  return { enqueued: page.results.length }
}
