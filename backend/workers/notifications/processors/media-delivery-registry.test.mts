import { describe, expect, it } from 'vitest'
import {
  readTestAppliedMediaRegistryJobs,
  readTestMediaRegistryReconcileJobs,
  setTestMediaRecoveryState,
  withTestMediaRecoveryBacklog,
} from '@voucha/test-helpers/media-delivery-recovery'
import { withTestMediaRecoveryBacklogWithOutsider } from '@voucha/test-helpers/media-delivery-recovery-scope'
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

  it('enqueues one owned recovery page and persists its continuation', async () => {
    const user = await createTestUser({ administrator: true })
    await withTestMediaRecoveryBacklogWithOutsider(
      user.id,
      2,
      async ({ recordIds, scanBefore }) => {
        expect(
          await processReconcileMediaDeliveryRegistry(
            {},
            { recordIds, imageIds: [], scanBefore },
            1,
            1,
          ),
        ).toEqual({ enqueued: 1 })
        expect((await readTestAppliedMediaRegistryJobs(recordIds)).map(job => job.data)).toEqual([
          { mediaDeliveryRegistryRecordId: recordIds[0] },
        ])
        expect(
          await readTestMediaRegistryReconcileJobs(data => data.scanBefore === scanBefore),
        ).toHaveLength(1)
      },
    )
  })

  it('terminalizes one owned expired final claim per page without changing its eligible neighbor', async () => {
    const user = await createTestUser({ administrator: true })
    await withTestMediaRecoveryBacklog(user.id, 4, async ({ recordIds, scanBefore }) => {
      const [outside, first, second, pending] = recordIds
      await setTestMediaRecoveryState([outside!, first!, second!], {
        state: 'claimed',
        attempts: 5,
        at: new Date(new Date(scanBefore).getTime() - 6 * 60_000).toISOString(),
      })
      const before = await getTestMediaDeliveryRecordSnapshot(outside!)
      const options = { recordIds: [first!, second!, pending!], imageIds: [], scanBefore }

      expect(await processReconcileMediaDeliveryRegistry({}, options, 1, 1)).toEqual({
        enqueued: 1,
      })
      expect(await getTestMediaDeliveryRecordSnapshot(first!)).toMatchObject({ state: 'failed' })
      expect(await getTestMediaDeliveryRecordSnapshot(second!)).toMatchObject({ state: 'claimed' })
      expect(await processReconcileMediaDeliveryRegistry({}, options, 1, 1)).toEqual({
        enqueued: 1,
      })
      expect(await getTestMediaDeliveryRecordSnapshot(second!)).toMatchObject({ state: 'failed' })
      expect((await readTestAppliedMediaRegistryJobs(recordIds)).map(job => job.data)).toEqual([
        { mediaDeliveryRegistryRecordId: pending },
      ])
      expect(await getTestMediaDeliveryRecordSnapshot(outside!)).toEqual(before)
    })
  })
})
