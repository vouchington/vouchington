import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
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
import {
  insertPreservationHoldForTest,
  readPreservationHoldsForTest,
  releasePreservationHoldAtForTest,
} from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { runRetentionWithPendingHoldForTest } from '@voucha/test-helpers/preservation-hold-retention-race'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { stageImagePlacementDeliveryRecord } from '../../media-delivery-safety/index.mts'
import { cleanupOldMediaDeliveryChanges } from '../cleanup-media-delivery-changes.mts'

describe('media delivery transition retention', () => {
  it('keeps a superseded transition when its account hold commits before retention', async () => {
    const [admin, held, unheld] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const [preserved, control] = await Promise.all(
      [held, unheld].map(async owner => {
        const imageId = await insertTestImage(owner.id)
        await setTestUserProfileImage(owner.id, imageId)
        const [placement] = await getTestImageSurfacePlacements({ userId: owner.id })
        if (!placement) throw new Error('Missing owned placement')
        const { mediaDeliveryRegistryRecordId, generation } =
          await stageImagePlacementDeliveryRecord({
            placementId: placement.placement_id,
            revision: placement.placement_revision,
            imageId,
            state: 'allow',
          })
        const old = await insertAgedMediaDeliveryTransitionForTest(
          mediaDeliveryRegistryRecordId,
          generation,
          'allow',
          at(100),
        )
        await insertAgedMediaDeliveryTransitionForTest(
          mediaDeliveryRegistryRecordId,
          generation,
          'allow',
          at(5),
        )
        return old
      }),
    )

    const hold = await runRetentionWithPendingHoldForTest(
      admin,
      held.id,
      'deleteMediaDeliveryChangePage',
      preserved,
      () =>
        withCommittedPostgresTransactionForTest(async query => {
          await resetMediaDeliveryRetentionCursorForTest(query)
          await cleanupOldMediaDeliveryChanges({
            now,
            lowerBoundDate,
            maxBatches: 1,
            batchSize: 2,
            changeIds: [control, preserved],
            query,
          })
        }),
    )

    expect(await readPreservationHoldsForTest(held.id)).toEqual([
      expect.objectContaining({ id: hold.id, released_at: null }),
    ])
    expect(await mediaDeliveryTransitionExistsForTest(control)).toBe(false)
    expect(await mediaDeliveryTransitionExistsForTest(preserved)).toBe(true)
  })

  it('rejects mutations outside the scoped old-superseded delete and keeps withheld history and recent completions', async () => {
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
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const oldDate = at(100)
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
    const oldAllowAfterWithheld = await insertAgedMediaDeliveryTransitionForTest(
      staged.mediaDeliveryRegistryRecordId,
      allowGeneration,
      'allow',
      oldDate,
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
      batchSize: 4,
      lowerBoundDate,
      query,
    })
    expect(page).toMatchObject({ deleted: 2, hasMore: false })
    expect(await mediaDeliveryTransitionExistsForTest(oldAllow, query)).toBe(false)
    expect(await mediaDeliveryTransitionExistsForTest(oldAllowAfterWithheld, query)).toBe(false)
    expect(await mediaDeliveryTransitionExistsForTest(oldWithheld, query)).toBe(true)
    expect(await mediaDeliveryTransitionExistsForTest(recentlyCompleted, query)).toBe(true)

    await resetMediaDeliveryRetentionCursorForTest(query)
    expect(
      await cleanupOldMediaDeliveryChanges({
        now,
        maxBatches: 1,
        batchSize: 1,
        lowerBoundDate,
        query,
      }),
    ).toMatchObject({ deleted: 0, hasMore: false, continuation: null })
    expect(await mediaDeliveryTransitionExistsForTest(oldWithheld, query)).toBe(true)
  })

  async function sweepHeldPlacement(releasedDaysAgo: number | null | 'never-held') {
    const user = await createTestUserDirect()
    const admin = await createTestUserDirect()
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
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const [held, released, free] = await Promise.all([
      insertAgedMediaDeliveryTransitionForTest(
        staged.mediaDeliveryRegistryRecordId,
        staged.generation,
        'allow',
        at(100),
      ),
      insertAgedMediaDeliveryTransitionForTest(
        staged.mediaDeliveryRegistryRecordId,
        staged.generation,
        'allow',
        at(99),
      ),
      insertAgedMediaDeliveryTransitionForTest(
        staged.mediaDeliveryRegistryRecordId,
        staged.generation,
        'allow',
        at(98),
      ),
    ])
    // The newest transition is the record's latest and stays regardless of any hold.
    await insertAgedMediaDeliveryTransitionForTest(
      staged.mediaDeliveryRegistryRecordId,
      staged.generation,
      'allow',
      at(5),
    )
    const sweep = async () => {
      await using query = await beginTransaction()
      await resetMediaDeliveryRetentionCursorForTest(query)
      await cleanupOldMediaDeliveryChanges({
        now,
        lowerBoundDate,
        maxBatches: 1,
        batchSize: 10,
        query,
      })
      return await Promise.all(
        [held, released, free].map(id => mediaDeliveryTransitionExistsForTest(id, query)),
      )
    }

    if (releasedDaysAgo !== 'never-held') {
      const holdId = await insertPreservationHoldForTest(user.id, admin.id)
      if (releasedDaysAgo !== null) {
        await releasePreservationHoldAtForTest(holdId, admin.id, at(releasedDaysAgo))
      }
    }
    return sweep()
  }

  it('keeps superseded transitions while a hold is open or was released inside the window', async () => {
    expect(await sweepHeldPlacement(null)).toEqual([true, true, true])
    expect(await sweepHeldPlacement(10)).toEqual([true, true, true])
  })

  it('deletes them once a hold was released before the window or never existed', async () => {
    expect(await sweepHeldPlacement(95)).toEqual([false, false, false])
    expect(await sweepHeldPlacement('never-held')).toEqual([false, false, false])
  })
})
