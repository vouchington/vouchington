import { describe, expect, it, vi } from 'vitest'
import type { enqueueApplyMediaDeliveryRegistryRecord } from '@queues/notifications/enqueues'
import type {
  listRecoverableMediaDeliveryRegistryKeys,
  processMediaDeliveryRegistryRecord,
  stageAllCurrentImagePlacementDeliveryRecords,
  reconcileMediaDeliveryRepairMarkers,
} from '@services/media-delivery-safety'
import {
  processApplyMediaDeliveryRegistryRecord,
  processReconcileMediaDeliveryRegistry,
} from './media-delivery-registry.mts'

describe('media delivery registry processors', () => {
  it('does not claim a record when registry publication is disabled', async () => {
    const { processMediaDeliveryRegistryRecord } = await import('@services/media-delivery-safety')
    await expect(
      processMediaDeliveryRegistryRecord('legacy-image:00000000-0000-7000-8000-000000000001'),
    ).resolves.toBe('not_claimed')
  })

  it('passes one staged delivery key to the durable processor', async () => {
    const process = vi
      .fn<typeof processMediaDeliveryRegistryRecord>()
      .mockResolvedValue('completed')
    const now = new Date('2026-07-01T12:00:00.000Z')

    await expect(
      processApplyMediaDeliveryRegistryRecord(
        { deliveryKey: 'image-placement:00000000-0000-7000-8000-000000000001:1:asset' },
        { processMediaDeliveryRegistryRecord: process, now: () => now },
      ),
    ).resolves.toBe('completed')
    expect(process).toHaveBeenCalledWith(
      'image-placement:00000000-0000-7000-8000-000000000001:1:asset',
      now,
    )
  })

  it('stages current placements then re-enqueues only recoverable registry keys', async () => {
    const list = vi
      .fn<typeof listRecoverableMediaDeliveryRegistryKeys>()
      .mockResolvedValue([
        'image-placement:00000000-0000-7000-8000-000000000001:1:asset',
        'legacy-image:00000000-0000-7000-8000-000000000002',
      ])
    const enqueue = vi
      .fn<typeof enqueueApplyMediaDeliveryRegistryRecord>()
      .mockResolvedValue(undefined)
    const stage = vi.fn<typeof stageAllCurrentImagePlacementDeliveryRecords>().mockResolvedValue(2)
    const repair = vi.fn<typeof reconcileMediaDeliveryRepairMarkers>().mockResolvedValue(0)
    const now = new Date('2026-07-01T12:00:00.000Z')

    await expect(
      processReconcileMediaDeliveryRegistry({
        listRecoverableMediaDeliveryRegistryKeys: list,
        enqueueApplyMediaDeliveryRegistryRecord: enqueue,
        stageAllCurrentImagePlacementDeliveryRecords: stage,
        reconcileMediaDeliveryRepairMarkers: repair,
        now: () => now,
      }),
    ).resolves.toEqual({ enqueued: 2 })
    expect(stage).toHaveBeenCalledOnce()
    expect(repair).toHaveBeenCalledWith(100)
    expect(list).toHaveBeenCalledWith(100, now)
    expect(enqueue).toHaveBeenCalledTimes(2)
  })
})
