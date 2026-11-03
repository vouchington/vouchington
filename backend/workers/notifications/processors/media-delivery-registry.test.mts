import { describe, expect, it, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { mediaDeliverySafetyWorkConfig } from '@services/media-delivery-safety/work-limits'
import { readTestAppliedMediaRegistryJobs } from '@voucha/test-helpers/media-delivery-recovery'
import type {
  listRecoverableMediaDeliveryRegistryIds,
  stageImagePlacementDeliveryRecordPage,
  reconcileMediaDeliveryRepairMarkers,
} from '@services/media-delivery-safety'
import {
  createTestUser,
  insertTestImage,
  insertTestTopic,
  getTestImageSurfacePlacements,
  setTestTopicSurfaceImages,
} from '@voucha/test-helpers'
import { getTestMediaDeliveryRegistryRecordId } from '@voucha/test-helpers/entities/image-surface-placements'
import { getTestMediaDeliveryRecordSnapshot } from '@voucha/test-helpers/entities/media-delivery-retry'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  processApplyMediaDeliveryRegistryRecord,
  processReconcileMediaDeliveryRegistry,
} from './media-delivery-registry.mts'

describe('media delivery registry processors', () => {
  it('does not claim a record when registry publication is disabled', async () => {
    await expect(
      processApplyMediaDeliveryRegistryRecord({
        mediaDeliveryRegistryRecordId:
          'image-placement:00000000-0000-7000-8000-000000000001:0:00000000-0000-7000-8000-000000000002',
      }),
    ).resolves.toBe('not_claimed')
  })

  it('publishes the owned staged record whose id it was given', async () => {
    const user = await createTestUser({ administrator: true })
    const imageId = await insertTestImage(user.id)
    const topicId = await insertTestTopic({
      name: `apply-${crypto.randomUUID()}`,
      slug: `apply-${crypto.randomUUID()}`,
      createdById: user.id,
    })
    await setTestTopicSurfaceImages(topicId, { logoImageId: imageId })
    const [placement] = await getTestImageSurfacePlacements({ topicId })
    const mediaDeliveryRegistryRecordId = await getTestMediaDeliveryRegistryRecordId({
      placementId: placement!.placement_id,
      revision: placement!.placement_revision,
      imageId,
    })
    installTestMediaDeliveryEdge()

    await expect(
      processApplyMediaDeliveryRegistryRecord({
        mediaDeliveryRegistryRecordId: mediaDeliveryRegistryRecordId!,
      }),
    ).resolves.toBe('completed')
    expect(await getTestMediaDeliveryRecordSnapshot(mediaDeliveryRegistryRecordId!)).toMatchObject({
      state: 'completed',
    })
  })

  it.each([100, 1])(
    'uses configured recovery page size %i for repairs and discovery',
    async pageSize => {
      const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        recovery_page_size: pageSize,
      })
      try {
        const ownedRecordIds = [
          `image-placement:${crypto.randomUUID()}:1:${crypto.randomUUID()}`,
          `image-placement:${crypto.randomUUID()}:0:${crypto.randomUUID()}`,
        ]
        const list = vi.fn<typeof listRecoverableMediaDeliveryRegistryIds>().mockResolvedValue({
          results: ownedRecordIds,
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        })
        const stage = vi
          .fn<typeof stageImagePlacementDeliveryRecordPage>()
          .mockResolvedValue({ staged: 2, hasMore: false, scanBefore: '2026-07-01T12:00:00.000Z' })
        const repair = vi.fn<typeof reconcileMediaDeliveryRepairMarkers>().mockResolvedValue(0)
        const now = new Date('2026-07-01T12:00:00.000Z')

        await expect(
          processReconcileMediaDeliveryRegistry(
            {},
            {
              listRecoverableMediaDeliveryRegistryIds: list,
              stageImagePlacementDeliveryRecordPage: stage,
              reconcileMediaDeliveryRepairMarkers: repair,
              getMediaDeliveryRegistryScanBefore: async () => now.toISOString(),
              failExpiredExhaustedMediaDeliveryRegistryRecords: async () => 0,
            },
          ),
        ).resolves.toEqual({ enqueued: 2 })
        expect(stage).toHaveBeenCalledOnce()
        expect(repair).toHaveBeenCalledWith(pageSize)
        expect(list).toHaveBeenCalledWith({
          limit: pageSize,
          scanBefore: now.toISOString(),
          after: undefined,
        })
        const jobs = await readTestAppliedMediaRegistryJobs(ownedRecordIds)
        expect(jobs.map(job => job.data)).toEqual([
          { mediaDeliveryRegistryRecordId: ownedRecordIds[0] },
          { mediaDeliveryRegistryRecordId: ownedRecordIds[1] },
        ])
      } finally {
        restore()
      }
    },
  )
})
