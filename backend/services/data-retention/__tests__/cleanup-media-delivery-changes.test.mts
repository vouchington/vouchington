import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestImageSurfacePlacements,
  insertTestImage,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import {
  deleteMediaDeliveryTransitionForTest,
  insertAgedMediaDeliveryTransitionForTest,
  mediaDeliveryTransitionExistsForTest,
  resetMediaDeliveryRetentionCursorForTest,
  setMediaDeliveryDesiredStateForTest,
  updateMediaDeliveryTransitionForTest,
} from '@voucha/test-helpers/entities/media-delivery-retention'
import { stageImagePlacementDeliveryRecord } from '../../media-delivery-safety/index.mts'
import { cleanupOldMediaDeliveryChanges } from '../cleanup-media-delivery-changes.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('media delivery transition retention', () => {
  it('rejects mutations outside the scoped old-superseded delete and keeps withheld history', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await setTestUserProfileImage(user.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
    if (!placement) throw new Error('Missing owned placement')
    const staged = await stageImagePlacementDeliveryRecord({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
      state: 'allow',
    })
    const now = new Date()
    const oldDate = new Date(now.getTime() - 100 * DAY_MS)
    const oldAllow = await insertAgedMediaDeliveryTransitionForTest(
      staged.mediaDeliveryRegistryRecordId,
      staged.generation,
      'allow',
      oldDate,
    )
    const recentlyCompleted = await insertAgedMediaDeliveryTransitionForTest(
      staged.mediaDeliveryRegistryRecordId,
      staged.generation,
      'allow',
      oldDate,
      now,
    )
    const withheldGeneration = await setMediaDeliveryDesiredStateForTest(
      staged.mediaDeliveryRegistryRecordId,
      'withheld',
    )
    const oldWithheld = await insertAgedMediaDeliveryTransitionForTest(
      staged.mediaDeliveryRegistryRecordId,
      withheldGeneration,
      'withheld',
      oldDate,
    )
    const allowGeneration = await setMediaDeliveryDesiredStateForTest(
      staged.mediaDeliveryRegistryRecordId,
      'allow',
    )
    await insertAgedMediaDeliveryTransitionForTest(
      staged.mediaDeliveryRegistryRecordId,
      allowGeneration,
      'allow',
      now,
    )
    await expect(updateMediaDeliveryTransitionForTest(oldAllow)).rejects.toThrow(/immutable/i)
    await expect(deleteMediaDeliveryTransitionForTest(oldAllow)).rejects.toThrow(/immutable/i)

    await using query = await beginTransaction()
    await resetMediaDeliveryRetentionCursorForTest(query)
    const page = await cleanupOldMediaDeliveryChanges({
      now,
      maxBatches: 1,
      batchSize: 3,
      changeIds: [oldAllow, oldWithheld, recentlyCompleted],
      query,
    })
    expect(page).toMatchObject({ deleted: 1, hasMore: false })
    expect(await mediaDeliveryTransitionExistsForTest(oldAllow, query)).toBe(false)
    expect(await mediaDeliveryTransitionExistsForTest(oldWithheld, query)).toBe(true)
    expect(await mediaDeliveryTransitionExistsForTest(recentlyCompleted, query)).toBe(true)
  })
})
