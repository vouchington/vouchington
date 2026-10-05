import { describe, expect, it } from 'vitest'
import { stagePostImagePlacementDeliveryRecords } from './delivery-registry-staging.mts'
import { stageCurrentImagePlacementDeliveryRecordsForImageIds } from './delivery-registry-reconciliation.mts'
import {
  createTestUserDirect,
  getTestImageSurfacePlacements,
  getTestMediaDeliveryRecordSnapshot,
  getTestMediaDeliveryTransitionHistory,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  getTestPostImagePlacement,
  scheduleTestMediaDeliveryRetry,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import { setTestMediaRecoveryState } from '@voucha/test-helpers/media-delivery-recovery'
import { stageImagePlacementDeliveryRecord } from './index.mts'

describe('media registry staging state', () => {
  it('retains earlier desired states and generations when authority changes or is republished', async () => {
    const tuple = await createPlacement()
    const first = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
    const before = await getTestMediaDeliveryTransitionHistory(first.deliveryKey)
    const changed = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'withheld' })
    const forced = await stageImagePlacementDeliveryRecord(
      { ...tuple, state: 'withheld' },
      { forceGeneration: true },
    )
    const after = await getTestMediaDeliveryTransitionHistory(first.deliveryKey)
    expect(before.at(-1)?.desired_state).toBe('allow')
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after.slice(before.length)).toEqual([
      { generation: changed.generation, desired_state: 'withheld', change_type: 'pending' },
      { generation: forced.generation, desired_state: 'withheld', change_type: 'pending' },
    ])
    expect(await getTestMediaDeliveryRecordSnapshot(first.deliveryKey)).toMatchObject({
      desired_state: 'withheld',
      state: 'pending',
    })
  })
  it('retains unchanged placement snapshots in every lifecycle state', async () => {
    const tuple = await createPlacement()
    const placement = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
    const keys = [placement.deliveryKey]
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
