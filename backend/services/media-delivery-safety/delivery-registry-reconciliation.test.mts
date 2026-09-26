import { describe, expect, it } from 'vitest'
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
  getImagePlacementDeliveryKey,
  getMediaDeliveryRegistryScanBefore,
  getLegacyImageDeliveryKey,
  stageAllCurrentImagePlacementDeliveryRecords,
  stageCurrentImagePlacementDeliveryRecordsForImageIds,
  stageImagePlacementDeliveryRecord,
  stageLegacyImageDeliveryRecord,
  listRecoverableMediaDeliveryRegistryKeys,
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
      (await listRecoverableMediaDeliveryRegistryKeys({
        limit: 100,
        scanBefore: await getMediaDeliveryRegistryScanBefore(),
        deliveryKeys: [selected.deliveryKey],
      })).results,
    ).toEqual([selected.deliveryKey])
    await Promise.all(
      [selected, unrelated].map(placement =>
        markTestMediaDeliveryRecordFailed(placement.deliveryKey),
      ),
    )
    const unrelatedBefore = await getTestMediaDeliveryRecordSnapshot(unrelated.deliveryKey)
    expect(
      await replayFailedMediaDeliveryRegistryRecords({ deliveryKeys: [selected.deliveryKey] }),
    ).toBe(1)
    expect(await getTestMediaDeliveryRecord(selected.deliveryKey)).toMatchObject({
      state: 'pending',
    })
    expect(await getTestMediaDeliveryRecordSnapshot(unrelated.deliveryKey)).toEqual(unrelatedBefore)
  })

  it('stages current placement and legacy records only for selected images', async () => {
    const [selected, unrelated] = await Promise.all([
      createCurrentProfilePlacement(),
      createCurrentProfilePlacement(),
    ])
    await Promise.all([
      stageImagePlacementDeliveryRecord({ ...selected, state: 'withheld' }),
      stageLegacyImageDeliveryRecord(selected.imageId, 'allow'),
      stageImagePlacementDeliveryRecord({ ...unrelated, state: 'withheld' }),
      stageLegacyImageDeliveryRecord(unrelated.imageId, 'allow'),
    ])
    const nextAttemptAt = new Date(Date.now() + 60_000)
    await Promise.all([
      scheduleTestMediaDeliveryRetry(unrelated.deliveryKey, nextAttemptAt),
      scheduleTestMediaDeliveryRetry(getLegacyImageDeliveryKey(unrelated.imageId), nextAttemptAt),
    ])
    const unrelatedBefore = await Promise.all([
      getTestMediaDeliveryRecordSnapshot(unrelated.deliveryKey),
      getTestMediaDeliveryRecordSnapshot(getLegacyImageDeliveryKey(unrelated.imageId)),
    ])
    expect(unrelatedBefore).toEqual([
      expect.objectContaining({
        desired_state: 'withheld',
        delivery_attempt_count: 3,
        next_attempt_at: expect.any(String),
      }),
      expect.objectContaining({
        desired_state: 'allow',
        delivery_attempt_count: 3,
        next_attempt_at: expect.any(String),
      }),
    ])

    expect(await stageCurrentImagePlacementDeliveryRecordsForImageIds([selected.imageId])).toBe(2)
    expect(await getTestMediaDeliveryRecord(selected.deliveryKey)).toMatchObject({
      desired_state: 'allow',
    })
    expect(
      await getTestMediaDeliveryRecord(getLegacyImageDeliveryKey(selected.imageId)),
    ).toMatchObject({ desired_state: 'withheld' })
    expect(
      await Promise.all([
        getTestMediaDeliveryRecordSnapshot(unrelated.deliveryKey),
        getTestMediaDeliveryRecordSnapshot(getLegacyImageDeliveryKey(unrelated.imageId)),
      ]),
    ).toEqual(unrelatedBefore)
  })

  it('withholds only selected unsafe records and treats an empty scope as a no-op', async () => {
    const [selected, unrelated] = await Promise.all([
      createCurrentProfilePlacement(),
      createCurrentProfilePlacement(),
    ])
    await Promise.all([
      stageImagePlacementDeliveryRecord({ ...selected, state: 'allow' }),
      stageLegacyImageDeliveryRecord(selected.imageId, 'allow'),
      stageImagePlacementDeliveryRecord({ ...unrelated, state: 'allow' }),
      stageLegacyImageDeliveryRecord(unrelated.imageId, 'allow'),
    ])
    await Promise.all([
      markImageModerationFlagged(selected.imageId),
      markImageModerationFlagged(unrelated.imageId),
    ])
    const nextAttemptAt = new Date(Date.now() + 60_000)
    await Promise.all([
      scheduleTestMediaDeliveryRetry(unrelated.deliveryKey, nextAttemptAt),
      scheduleTestMediaDeliveryRetry(getLegacyImageDeliveryKey(unrelated.imageId), nextAttemptAt),
    ])
    const unrelatedBefore = await Promise.all([
      getTestMediaDeliveryRecordSnapshot(unrelated.deliveryKey),
      getTestMediaDeliveryRecordSnapshot(getLegacyImageDeliveryKey(unrelated.imageId)),
    ])
    expect(unrelatedBefore).toEqual([
      expect.objectContaining({
        desired_state: 'allow',
        delivery_attempt_count: 3,
        next_attempt_at: expect.any(String),
      }),
      expect.objectContaining({
        desired_state: 'allow',
        delivery_attempt_count: 3,
        next_attempt_at: expect.any(String),
      }),
    ])

    expect(await stageCurrentImagePlacementDeliveryRecordsForImageIds([selected.imageId])).toBe(2)
    expect(await getTestMediaDeliveryRecord(selected.deliveryKey)).toMatchObject({
      desired_state: 'withheld',
    })
    expect(
      await getTestMediaDeliveryRecord(getLegacyImageDeliveryKey(selected.imageId)),
    ).toMatchObject({ desired_state: 'withheld' })
    expect(
      await Promise.all([
        getTestMediaDeliveryRecordSnapshot(unrelated.deliveryKey),
        getTestMediaDeliveryRecordSnapshot(getLegacyImageDeliveryKey(unrelated.imageId)),
      ]),
    ).toEqual(unrelatedBefore)

    const selectedBefore = await Promise.all([
      getTestMediaDeliveryRecordSnapshot(selected.deliveryKey),
      getTestMediaDeliveryRecordSnapshot(getLegacyImageDeliveryKey(selected.imageId)),
    ])
    expect(await stageCurrentImagePlacementDeliveryRecordsForImageIds([])).toBe(0)
    expect(await stageAllCurrentImagePlacementDeliveryRecords([])).toBe(0)
    expect(
      await Promise.all([
        getTestMediaDeliveryRecordSnapshot(selected.deliveryKey),
        getTestMediaDeliveryRecordSnapshot(getLegacyImageDeliveryKey(selected.imageId)),
      ]),
    ).toEqual(selectedBefore)
    expect(
      await Promise.all([
        getTestMediaDeliveryRecordSnapshot(unrelated.deliveryKey),
        getTestMediaDeliveryRecordSnapshot(getLegacyImageDeliveryKey(unrelated.imageId)),
      ]),
    ).toEqual(unrelatedBefore)
  })
})

async function createCurrentProfilePlacement(): Promise<{
  imageId: string
  placementId: string
  revision: number
  deliveryKey: string
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
    deliveryKey: getImagePlacementDeliveryKey({ placementId, revision, imageId }),
  }
}
