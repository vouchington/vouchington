import { enqueueApplyMediaDeliveryRegistryRecord } from '@queues/notifications/enqueues'
import {
  listRecoverableMediaDeliveryRegistryKeys,
  processMediaDeliveryRegistryRecord,
  stageAllCurrentImagePlacementDeliveryRecords,
  reconcileMediaDeliveryRepairMarkers,
} from '@services/media-delivery-safety'

type MediaDeliveryRegistryProcessorDependencies = {
  enqueueApplyMediaDeliveryRegistryRecord: typeof enqueueApplyMediaDeliveryRegistryRecord
  listRecoverableMediaDeliveryRegistryKeys: typeof listRecoverableMediaDeliveryRegistryKeys
  processMediaDeliveryRegistryRecord: typeof processMediaDeliveryRegistryRecord
  stageAllCurrentImagePlacementDeliveryRecords: typeof stageAllCurrentImagePlacementDeliveryRecords
  reconcileMediaDeliveryRepairMarkers: typeof reconcileMediaDeliveryRepairMarkers
  now: () => Date
}

export async function processApplyMediaDeliveryRegistryRecord(
  data: { deliveryKey: string },
  dependencies: Partial<MediaDeliveryRegistryProcessorDependencies> = {},
): Promise<'completed' | 'not_claimed'> {
  const process =
    dependencies.processMediaDeliveryRegistryRecord ?? processMediaDeliveryRegistryRecord
  const now = dependencies.now ?? (() => new Date())
  return await process(data.deliveryKey, now())
}

export async function processReconcileMediaDeliveryRegistry(
  dependencies: Partial<MediaDeliveryRegistryProcessorDependencies> = {},
): Promise<{ enqueued: number }> {
  const list =
    dependencies.listRecoverableMediaDeliveryRegistryKeys ??
    listRecoverableMediaDeliveryRegistryKeys
  const enqueue =
    dependencies.enqueueApplyMediaDeliveryRegistryRecord ?? enqueueApplyMediaDeliveryRegistryRecord
  const now = dependencies.now ?? (() => new Date())
  const stage =
    dependencies.stageAllCurrentImagePlacementDeliveryRecords ??
    stageAllCurrentImagePlacementDeliveryRecords
  const repair =
    dependencies.reconcileMediaDeliveryRepairMarkers ?? reconcileMediaDeliveryRepairMarkers
  // ast-grep-ignore: no-three-sequential-awaits -- repair may mint newer authority; stage current records before listing the generations to enqueue
  await repair(100)
  await stage()
  const deliveryKeys = await list(100, now())
  await Promise.all(deliveryKeys.map(deliveryKey => enqueue(deliveryKey)))
  return { enqueued: deliveryKeys.length }
}
