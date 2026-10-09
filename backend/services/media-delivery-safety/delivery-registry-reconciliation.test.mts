import { describe, expect, it } from 'vitest'
import { stageCurrentImagePlacementDeliveryRecordsForImageIds } from './delivery-registry-reconciliation.mts'
import {
  createTestUserDirect,
  getTestImageSurfacePlacements,
  getTestMediaDeliveryRecord,
  getTestMediaDeliveryRecordSnapshot,
  insertTestImage,
  markImageModerationFlagged,
  markTestMediaDeliveryRecordFailed,
  scheduleTestMediaDeliveryRetry,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import {
  getMediaDeliveryRegistryScanBefore,
  stageAllCurrentImagePlacementDeliveryRecords,
  stageImagePlacementDeliveryRecord,
  listRecoverableMediaDeliveryRegistryIds,
  replayFailedMediaDeliveryRegistryRecords,
} from './index.mts'

describe('scoped media delivery reconciliation', () => {
  it('lists and replays only owned eligible registry records', async () => {
    const [selected, unrelated] = await Promise.all([
      createCurrentProfilePlacement(),
      createCurrentProfilePlacement(),
    ])
    await Promise.all(
      [selected, unrelated].map(placement =>
        stageImagePlacementDeliveryRecord({ ...placement, state: 'allow' }),
      ),
    )
    expect(
      (
        await listRecoverableMediaDeliveryRegistryIds({
          limit: 100,
          scanBefore: await getMediaDeliveryRegistryScanBefore(),
          recordIds: [selected.mediaDeliveryRegistryRecordId],
        })
      ).results,
    ).toEqual([selected.mediaDeliveryRegistryRecordId])
    await Promise.all(
      [selected, unrelated].map(placement =>
        markTestMediaDeliveryRecordFailed(placement.mediaDeliveryRegistryRecordId),
      ),
    )
    const unrelatedBefore = await getTestMediaDeliveryRecordSnapshot(
      unrelated.mediaDeliveryRegistryRecordId,
    )
    expect(
      await replayFailedMediaDeliveryRegistryRecords({
        recordIds: [selected.mediaDeliveryRegistryRecordId],
      }),
    ).toMatchObject({ replayed: 1 })
    expect(await getTestMediaDeliveryRecord(selected.mediaDeliveryRegistryRecordId)).toMatchObject({
      state: 'pending',
    })
    expect(
      await getTestMediaDeliveryRecordSnapshot(unrelated.mediaDeliveryRegistryRecordId),
    ).toEqual(unrelatedBefore)
  })

  it('stages current placement records only for selected images', async () => {
    const [selected, unrelated] = await Promise.all([
      createCurrentProfilePlacement(),
      createCurrentProfilePlacement(),
    ])
    await Promise.all([
      stageImagePlacementDeliveryRecord({ ...selected, state: 'withheld' }),
      stageImagePlacementDeliveryRecord({ ...unrelated, state: 'withheld' }),
    ])
    await scheduleTestMediaDeliveryRetry(
      unrelated.mediaDeliveryRegistryRecordId,
      new Date(Date.now() + 60_000),
    )
    const unrelatedBefore = await getTestMediaDeliveryRecordSnapshot(
      unrelated.mediaDeliveryRegistryRecordId,
    )
    expect(unrelatedBefore).toMatchObject({
      desired_state: 'withheld',
      delivery_attempt_count: 3,
      next_attempt_at: expect.any(String),
    })

    expect(await stageCurrentImagePlacementDeliveryRecordsForImageIds([selected.imageId])).toBe(1)
    expect(await getTestMediaDeliveryRecord(selected.mediaDeliveryRegistryRecordId)).toMatchObject({
      desired_state: 'allow',
    })
    expect(
      await getTestMediaDeliveryRecordSnapshot(unrelated.mediaDeliveryRegistryRecordId),
    ).toEqual(unrelatedBefore)
  })

  it('withholds only selected unsafe records and treats an empty scope as a no-op', async () => {
    const [selected, unrelated] = await Promise.all([
      createCurrentProfilePlacement(),
      createCurrentProfilePlacement(),
    ])
    await Promise.all([
      stageImagePlacementDeliveryRecord({ ...selected, state: 'allow' }),
      stageImagePlacementDeliveryRecord({ ...unrelated, state: 'allow' }),
    ])
    await Promise.all([
      markImageModerationFlagged(selected.imageId),
      markImageModerationFlagged(unrelated.imageId),
    ])
    await scheduleTestMediaDeliveryRetry(
      unrelated.mediaDeliveryRegistryRecordId,
      new Date(Date.now() + 60_000),
    )
    const unrelatedBefore = await getTestMediaDeliveryRecordSnapshot(
      unrelated.mediaDeliveryRegistryRecordId,
    )
    expect(unrelatedBefore).toMatchObject({
      desired_state: 'allow',
      delivery_attempt_count: 3,
      next_attempt_at: expect.any(String),
    })

    expect(await stageCurrentImagePlacementDeliveryRecordsForImageIds([selected.imageId])).toBe(1)
    expect(await getTestMediaDeliveryRecord(selected.mediaDeliveryRegistryRecordId)).toMatchObject({
      desired_state: 'withheld',
    })
    expect(
      await getTestMediaDeliveryRecordSnapshot(unrelated.mediaDeliveryRegistryRecordId),
    ).toEqual(unrelatedBefore)
    const selectedBefore = await getTestMediaDeliveryRecordSnapshot(
      selected.mediaDeliveryRegistryRecordId,
    )
    expect(await stageCurrentImagePlacementDeliveryRecordsForImageIds([])).toBe(0)
    expect(await stageAllCurrentImagePlacementDeliveryRecords([])).toBe(0)
    expect(
      await getTestMediaDeliveryRecordSnapshot(selected.mediaDeliveryRegistryRecordId),
    ).toEqual(selectedBefore)
    expect(
      await getTestMediaDeliveryRecordSnapshot(unrelated.mediaDeliveryRegistryRecordId),
    ).toEqual(unrelatedBefore)
  })
})

async function createCurrentProfilePlacement(): Promise<{
  imageId: string
  placementId: string
  revision: number
  mediaDeliveryRegistryRecordId: string
}> {
  const user = await createTestUserDirect()
  const imageId = await insertTestImage(user.id)
  await setTestUserProfileImage(user.id, imageId)
  const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
  if (!placement) throw new Error('Missing test surface placement')
  const placementId = placement.placement_id
  const revision = placement.placement_revision
  return {
    imageId,
    placementId,
    revision,
    mediaDeliveryRegistryRecordId: (
      await stageImagePlacementDeliveryRecord({ placementId, revision, imageId, state: 'allow' })
    ).mediaDeliveryRegistryRecordId,
  }
}
