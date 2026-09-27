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
      processMediaDeliveryRegistryRecord(
        'image-placement:00000000-0000-7000-8000-000000000001:0:00000000-0000-7000-8000-000000000002',
      ),
    ).resolves.toBe('not_claimed')
  })

  it('passes one staged delivery key to the durable processor', async () => {
    const process = vi
      .fn<typeof processMediaDeliveryRegistryRecord>()
      .mockResolvedValue('completed')
    const now = new Date('2026-07-01T12:00:00.000Z')

    await expect(
      processApplyMediaDeliveryRegistryRecord(
        {
          deliveryKey:
            'image-placement:00000000-0000-7000-8000-000000000001:1:00000000-0000-7000-8000-000000000002',
        },
        { processMediaDeliveryRegistryRecord: process, now: () => now },
      ),
    ).resolves.toBe('completed')
    expect(process).toHaveBeenCalledWith(
      'image-placement:00000000-0000-7000-8000-000000000001:1:00000000-0000-7000-8000-000000000002',
      now,
    )
  })

  it('stages current placements then re-enqueues only recoverable registry keys', async () => {
    const list = vi.fn<typeof listRecoverableMediaDeliveryRegistryKeys>().mockResolvedValue({
      results: [
        'image-placement:00000000-0000-7000-8000-000000000001:1:00000000-0000-7000-8000-000000000002',
        'image-placement:00000000-0000-7000-8000-000000000003:0:00000000-0000-7000-8000-000000000004',
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    const enqueue = vi
      .fn<typeof enqueueApplyMediaDeliveryRegistryRecord>()
      .mockResolvedValue(undefined)
    const stage = vi.fn<typeof stageAllCurrentImagePlacementDeliveryRecords>().mockResolvedValue(2)
    const repair = vi.fn<typeof reconcileMediaDeliveryRepairMarkers>().mockResolvedValue(0)
    const now = new Date('2026-07-01T12:00:00.000Z')

    await expect(
      processReconcileMediaDeliveryRegistry(
        {},
        {
          listRecoverableMediaDeliveryRegistryKeys: list,
          enqueueApplyMediaDeliveryRegistryRecord: enqueue,
          stageAllCurrentImagePlacementDeliveryRecords: stage,
          reconcileMediaDeliveryRepairMarkers: repair,
          now: () => now,
          getMediaDeliveryRegistryScanBefore: async () => now.toISOString(),
          failExpiredExhaustedMediaDeliveryRegistryRecords: async () => 0,
        },
      ),
    ).resolves.toEqual({ enqueued: 2 })
    expect(stage).toHaveBeenCalledOnce()
    expect(repair).toHaveBeenCalledWith(100)
    expect(list).toHaveBeenCalledWith({
      limit: 100,
      scanBefore: now.toISOString(),
      after: undefined,
    })
    expect(enqueue).toHaveBeenCalledTimes(2)
  })
})
