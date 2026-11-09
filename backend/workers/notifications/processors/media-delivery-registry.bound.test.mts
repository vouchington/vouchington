import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { insertTestImage } from '@voucha/test-helpers/entities/images'
import { setTestUserProfileImage } from '@voucha/test-helpers/entities/media-surface-writes'
import {
  getTestImageSurfacePlacements,
  getTestMediaDeliveryRegistryRecordId,
} from '@voucha/test-helpers/entities/image-surface-placements'
import {
  readTestMediaRegistryReconcileJobs,
  readTestAppliedMediaRegistryJobs,
} from '@voucha/test-helpers/media-delivery-recovery'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import {
  withTestInterleavedMediaRecoveryBacklog,
  withTestMediaRecoveryBacklogWithOutsider,
} from '@voucha/test-helpers/media-delivery-recovery-scope'
import { getTestMediaDeliveryRecordSnapshot } from '@voucha/test-helpers/entities/media-delivery-retry'
import {
  stageImagePlacementDeliveryRecordPage,
  listRecoverableMediaDeliveryRegistryIds,
} from '@services/media-delivery-safety'
import { stageImagePlacementDeliveryRecord } from '@services/media-delivery-safety/delivery-registry-staging'
import type { ReconcileMediaDeliveryRegistryData } from '@queues/notifications/enqueues'
import { processReconcileMediaDeliveryRegistry } from './media-delivery-registry.mts'

describe('media registry staging continuation', () => {
  it('persists one continuation for a retried full page and finishes the remaining owned page', async () => {
    const user = await createTestUserDirect()
    await withTestInterleavedMediaRecoveryBacklog(
      user.id,
      3,
      async ({ recordIds, scanBefore, placements }) => {
        const ordered = placements.toSorted((left, right) =>
          left.placementId.localeCompare(right.placementId),
        )
        const cursor = (placement: (typeof placements)[number]) => ({
          placement_id: placement.placementId,
          placement_revision: placement.revision,
          image_id: placement.imageId,
        })
        const data = { staging: { scanBefore, after: cursor(ordered[0]!) } }
        const stagingJobs = () =>
          readTestMediaRegistryReconcileJobs(
            job => 'staging' in job && job.staging?.scanBefore === scanBefore,
          )
        const options = { recordIds, imageIds: placements.map(row => row.imageId) }
        const page = await stageImagePlacementDeliveryRecordPage(
          { ...data.staging, imageIds: options.imageIds },
          1,
        )
        expect(page).toMatchObject({ staged: 1, hasMore: true, after: cursor(ordered[1]!) })
        await processReconcileMediaDeliveryRegistry(data, options, 1, 1)
        await processReconcileMediaDeliveryRegistry(data, options, 1, 1)
        const next = { staging: { scanBefore, after: cursor(ordered[1]!) } }
        const persisted = await stagingJobs()
        expect(persisted).toHaveLength(1)
        const job = persisted[0]!
        expect(job).toMatchObject({
          name: 'notifications.processReconcileMediaDeliveryRegistry',
          data: next,
        })
        expect(job.opts.deduplication?.id).toBe(
          `media-delivery-registry-staging:${scanBefore}:${next.staging.after.placement_id}:${next.staging.after.placement_revision}:${next.staging.after.image_id}`,
        )
        await processReconcileMediaDeliveryRegistry(
          job.data as ReconcileMediaDeliveryRegistryData,
          options,
          1,
          1,
        )
        expect(await stagingJobs()).toHaveLength(1)
      },
    )
  })
})

describe('media registry staging retired raw page', () => {
  it('enqueues the raw cursor across consecutive zero-stage retired tuples', async () => {
    const retiredOwner = await createTestUserDirect()
    const activeOwner = await createTestUserDirect()
    const retiredImageId = await insertTestImage(retiredOwner.id)
    const activeImageId = await insertTestImage(activeOwner.id)
    await setTestUserProfileImage(retiredOwner.id, retiredImageId)
    await setTestUserProfileImage(retiredOwner.id, null)
    const [retired] = await getTestImageSurfacePlacements({ imageId: retiredImageId })

    const outsideOwner = await createTestUserDirect()
    const outsideImageId = await insertTestImage(outsideOwner.id)
    await setTestUserProfileImage(outsideOwner.id, outsideImageId)
    const [outside] = await getTestImageSurfacePlacements({ imageId: outsideImageId })
    const outsideRecordId = await getTestMediaDeliveryRegistryRecordId({
      placementId: outside!.placement_id,
      revision: outside!.placement_revision,
      imageId: outsideImageId,
    })
    await stageImagePlacementDeliveryRecord({
      placementId: outside!.placement_id,
      revision: outside!.placement_revision,
      imageId: outsideImageId,
      state: 'withheld',
    })
    const before = await getTestMediaDeliveryRecordSnapshot(outsideRecordId!)
    await setTestUserProfileImage(activeOwner.id, activeImageId)
    const [active] = await getTestImageSurfacePlacements({ imageId: activeImageId })
    if (!retired || !active) throw new Error('Missing owned staging placements')
    expect(retired.placement_id.localeCompare(outside!.placement_id)).toBeLessThan(0)
    expect(outside!.placement_id.localeCompare(active.placement_id)).toBeLessThan(0)
    expect(retired.retired_at).not.toBeNull()
    expect(active.retired_at).toBeNull()
    await stageImagePlacementDeliveryRecord({
      placementId: active.placement_id,
      revision: active.placement_revision,
      imageId: activeImageId,
      state: 'withheld',
    })

    const stagingJobs = () =>
      readTestMediaRegistryReconcileJobs(
        job => 'staging' in job && job.staging?.after.placement_id === retired.placement_id,
      )
    const options = { recordIds: [], imageIds: [retiredImageId, activeImageId] }
    const scanBefore = '2035-01-01T00:00:00.000Z'
    const data = {
      staging: {
        scanBefore,
        after: {
          placement_id: retired.placement_id,
          placement_revision: -1,
          image_id: '00000000-0000-0000-0000-000000000000',
        },
      },
    }
    expect(
      await stageImagePlacementDeliveryRecordPage(
        { ...data.staging, imageIds: options.imageIds },
        1,
      ),
    ).toMatchObject({ staged: 0, hasMore: true })
    await processReconcileMediaDeliveryRegistry(data, options, 1, 1)
    const firstJobs = await stagingJobs()
    expect(firstJobs).toHaveLength(1)
    const job = firstJobs[0]!
    expect(job).toMatchObject({
      name: 'notifications.processReconcileMediaDeliveryRegistry',
      data: {
        staging: {
          scanBefore,
          after: {
            placement_id: retired.placement_id,
            image_id: retiredImageId,
          },
        },
      },
    })
    await processReconcileMediaDeliveryRegistry(
      job.data as ReconcileMediaDeliveryRegistryData,
      options,
      1,
      1,
    )
    expect(
      await stageImagePlacementDeliveryRecordPage(
        {
          ...(job.data as ReconcileMediaDeliveryRegistryData).staging!,
          imageIds: options.imageIds,
        },
        1,
      ),
    ).toMatchObject({ staged: 0, hasMore: true })
    const allJobs = await stagingJobs()
    expect(allJobs).toHaveLength(2)
    const third = {
      staging: {
        scanBefore,
        after: {
          placement_id: retired.placement_id,
          placement_revision: retired.placement_revision,
          image_id: retiredImageId,
        },
      },
    }
    expect(
      await stageImagePlacementDeliveryRecordPage(
        { ...third.staging, imageIds: options.imageIds },
        1,
      ),
    ).toMatchObject({ staged: 1, hasMore: false })
    await processReconcileMediaDeliveryRegistry(third, options, 1, 1)
    expect(await getTestMediaDeliveryRecordSnapshot(outsideRecordId!)).toEqual(before)

    expect(allJobs.map(({ data: jobData }) => jobData)).toContainEqual({
      staging: {
        scanBefore,
        after: {
          placement_id: retired.placement_id,
          placement_revision: retired.placement_revision,
          image_id: retiredImageId,
        },
      },
    })
  })
})

describe('media registry staging read failure', () => {
  it('propagates a failed global page read before admitting children or continuation', async () => {
    const user = await createTestUserDirect()
    await withTestInterleavedMediaRecoveryBacklog(
      user.id,
      3,
      async ({ recordIds, scanBefore, placements }) => {
        const first = placements[0]!
        const error = new Error('Owned staging page read failure')
        let rejected = false
        const restore = rejectPostgresWriteForTest(
          'stageImagePlacementDeliveryRecordPage',
          error,
          values => {
            if (!values.includes(first.placementId))
              throw new Error('Staging failure fixture lost its owned cursor')
            rejected = true
            return true
          },
        )
        try {
          await expect(
            processReconcileMediaDeliveryRegistry(
              {
                staging: {
                  scanBefore,
                  after: {
                    placement_id: first.placementId,
                    placement_revision: first.revision,
                    image_id: first.imageId,
                  },
                },
              },
              { recordIds: [] },
              1,
              1,
            ),
          ).rejects.toBe(error)
        } finally {
          restore()
        }
        expect(rejected).toBe(true)
        expect(await readTestAppliedMediaRegistryJobs(recordIds)).toEqual([])
        expect(
          await readTestMediaRegistryReconcileJobs(
            data => data.staging?.scanBefore === scanBefore || data.scanBefore === scanBefore,
          ),
        ).toEqual([])
      },
    )
  })

  it('rejects a zero recovery page limit before reading owned records', async () => {
    const user = await createTestUserDirect()
    await withTestMediaRecoveryBacklogWithOutsider(
      user.id,
      1,
      async ({ recordIds, scanBefore }) => {
        await expect(
          listRecoverableMediaDeliveryRegistryIds({ recordIds, scanBefore, limit: 0 }),
        ).rejects.toThrow(
          new TypeError('Media recovery page limit must be between one and the page maximum'),
        )
        expect(await readTestAppliedMediaRegistryJobs(recordIds)).toEqual([])
        expect(
          await readTestMediaRegistryReconcileJobs(data => data.scanBefore === scanBefore),
        ).toEqual([])
      },
    )
  })
})
