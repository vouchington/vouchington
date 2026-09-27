import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getTestImageSurfacePlacements,
  getTestMediaDeliveryRecordSnapshot,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  getTestPostImagePlacement,
  scheduleTestMediaDeliveryRetry,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import { setTestMediaRecoveryState } from '@voucha/test-helpers/media-delivery-recovery'
import {
  stageImagePlacementDeliveryRecord,
  stageLegacyImageDeliveryRecord,
  stagePostImagePlacementDeliveryRecords,
  stageCurrentImagePlacementDeliveryRecordsForImageIds,
} from './index.mts'

describe('media registry staging state', () => {
  it('retains unchanged placement and legacy snapshots in every lifecycle state', async () => {
    const tuple = await createPlacement()
    const placement = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
    const legacy = await stageLegacyImageDeliveryRecord(tuple.imageId, 'withheld')
    const keys = [placement.deliveryKey, legacy.deliveryKey]
    for (const state of ['pending', 'claimed', 'completed', 'failed'] as const) {
      await setTestMediaRecoveryState(keys, {
        state,
        attempts: 3,
        at: new Date().toISOString(),
        nextAttemptAt: '2300-01-01T00:00:00Z',
      })
      const before = await Promise.all(keys.map(getTestMediaDeliveryRecordSnapshot))
      expect(await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })).toEqual(
        placement,
      )
      expect(await stageLegacyImageDeliveryRecord(tuple.imageId, 'withheld')).toEqual(legacy)
      expect(await stageCurrentImagePlacementDeliveryRecordsForImageIds([tuple.imageId])).toBe(0)
      expect(await Promise.all(keys.map(getTestMediaDeliveryRecordSnapshot))).toEqual(before)
    }
  })
  it('preserves unchanged post bulk retry evidence and resets changed authority attempts', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const postId = await insertTestPost({
      title: 'Owned media staging',
      slug: crypto.randomUUID(),
      createdById: user.id,
      markdown: 'owned image',
    })
    await insertTestPostImage({ postId, imageId })
    const placement = await getTestPostImagePlacement(postId, imageId)
    if (!placement) throw new Error('Missing post placement')
    const tuple = {
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
    }
    const initial = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
    await setTestMediaRecoveryState([initial.deliveryKey], {
      state: 'pending',
      attempts: 3,
      at: new Date().toISOString(),
      nextAttemptAt: '2300-01-01T00:00:00Z',
    })
    const before = await getTestMediaDeliveryRecordSnapshot(initial.deliveryKey)
    await stagePostImagePlacementDeliveryRecords(postId)
    expect(await getTestMediaDeliveryRecordSnapshot(initial.deliveryKey)).toEqual(before)
    await stageImagePlacementDeliveryRecord({ ...tuple, state: 'withheld' })
    await setTestMediaRecoveryState([initial.deliveryKey], {
      state: 'failed',
      attempts: 5,
      at: new Date().toISOString(),
    })
    await stagePostImagePlacementDeliveryRecords(postId)
    expect(await getTestMediaDeliveryRecordSnapshot(initial.deliveryKey)).toMatchObject({
      desired_state: 'allow',
      state: 'pending',
      delivery_attempt_count: 0,
      claimed_at: null,
      completed_at: null,
      next_attempt_at: null,
      failure_message: null,
    })
  })
  it('preserves every persisted field on unchanged placement staging', async () => {
    const tuple = await createPlacement()
    const initial = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
    await scheduleTestMediaDeliveryRetry(initial.deliveryKey, new Date(Date.now() + 60_000))
    const before = await getTestMediaDeliveryRecordSnapshot(initial.deliveryKey)
    expect(await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })).toEqual(initial)
    expect(await getTestMediaDeliveryRecordSnapshot(initial.deliveryKey)).toEqual(before)
  })
  it('resets changed authority and explicit republishing without reusing generations', async () => {
    const tuple = await createPlacement()
    const first = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
    await scheduleTestMediaDeliveryRetry(first.deliveryKey, new Date(Date.now() + 60_000))
    const changed = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'withheld' })
    expect(BigInt(changed.generation)).toBeGreaterThan(BigInt(first.generation))
    expect(await getTestMediaDeliveryRecordSnapshot(first.deliveryKey)).toMatchObject({
      state: 'pending',
      delivery_attempt_count: 0,
      next_attempt_at: null,
      failure_message: null,
    })
    await scheduleTestMediaDeliveryRetry(first.deliveryKey, new Date(Date.now() + 60_000))
    const forced = await stageImagePlacementDeliveryRecord(
      { ...tuple, state: 'withheld' },
      { forceGeneration: true },
    )
    expect(BigInt(forced.generation)).toBeGreaterThan(BigInt(changed.generation))
    expect(await getTestMediaDeliveryRecordSnapshot(first.deliveryKey)).toMatchObject({
      state: 'pending',
      delivery_attempt_count: 0,
      next_attempt_at: null,
      failure_message: null,
    })
  })
})

async function createPlacement() {
  const user = await createTestUserDirect()
  const imageId = await insertTestImage(user.id)
  await setTestUserProfileImage(user.id, imageId)
  const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
  if (!placement) throw new Error('Missing owned placement')
  return { imageId, placementId: placement.placement_id, revision: placement.placement_revision }
}
