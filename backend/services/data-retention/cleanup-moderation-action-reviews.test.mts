import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireModerationOperationRetentionTestLock,
  createTestExpiryWindow,
  createTestUser,
  insertTestModeratorAction,
} from '@voucha/test-helpers'
import { deleteTestModeratorActions } from '@voucha/test-helpers/entities/moderator-actions'
import {
  insertPreservationHoldForTest,
  readPreservationHoldsForTest,
  releasePreservationHoldForTest,
} from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { runRetentionWithPendingHoldForTest } from '@voucha/test-helpers/preservation-hold-retention-race'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { cleanupModerationRecords } from './cleanup-moderation-records.mts'

describe('annual integrity review action retention', () => {
  it('keeps a penalty review when its account hold commits before retention', async () => {
    const lock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    const window = createTestExpiryWindow()
    const [admin, held, unheld] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser(),
    ])
    const [preserved, control] = await Promise.all(
      [held, unheld].map(user =>
        insertTestModeratorAction({
          actorId: admin.id,
          targetUserId: user.id,
          actionType: 'report_integrity_penalty_review',
          occurredAt: window.firstEligibleDate,
        }),
      ),
    )
    onTestFinished(() => deleteTestModeratorActions([preserved.id, control.id]))
    const now = new Date(window.upperBoundDate)
    now.setUTCFullYear(now.getUTCFullYear() + 7)

    const hold = await runRetentionWithPendingHoldForTest(
      admin,
      held.id,
      'deleteExpiredModerationHistory:actions',
      preserved.id,
      () =>
        cleanupModerationRecords({
          kinds: ['actions'],
          batchSize: 2,
          maxBatches: 1,
          lowerBoundDate: window.lowerBoundDate,
          upperBoundDate: window.upperBoundDate,
          now,
        }),
    )

    expect(await readPreservationHoldsForTest(held.id)).toEqual([
      expect.objectContaining({ id: hold.id, released_at: null }),
    ])
    const remainingIds = (await readStaffActionHistory(admin.id)).map(action => action.id)
    expect(remainingIds).not.toContain(control.id)
    expect(remainingIds).toContain(preserved.id)
  })

  it('keeps review decisions for six years while ordinary staff actions keep their existing window', async () => {
    const lock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    const window = createTestExpiryWindow()
    const staff = await createTestUser()
    const heldTarget = await createTestUser()
    const oldReview = await insertTestModeratorAction({
      actorId: staff.id,
      actionType: 'report_integrity_penalty_review',
      occurredAt: window.firstEligibleDate,
    })
    const oldOrdinary = await insertTestModeratorAction({
      actorId: staff.id,
      actionType: 'pin',
      occurredAt: window.secondEligibleDate,
    })
    const heldReview = await insertTestModeratorAction({
      actorId: staff.id,
      targetUserId: heldTarget.id,
      actionType: 'vote_integrity_penalty_review',
      occurredAt: window.secondEligibleDate,
      occurredAtSequence: 1,
    })
    const holdId = await insertPreservationHoldForTest(heldTarget.id, staff.id)
    onTestFinished(() => deleteTestModeratorActions([oldReview.id, oldOrdinary.id, heldReview.id]))

    const options = {
      kinds: ['actions'] as const,
      batchSize: 3,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      upperBoundDate: window.upperBoundDate,
    }
    const fiveYearsLater = new Date(window.upperBoundDate)
    fiveYearsLater.setUTCFullYear(fiveYearsLater.getUTCFullYear() + 5)
    expect(await cleanupModerationRecords({ ...options, now: fiveYearsLater })).toMatchObject({
      deleted: 1,
    })
    expect((await readStaffActionHistory(staff.id)).map(action => action.id)).toContain(
      oldReview.id,
    )
    expect((await readStaffActionHistory(staff.id)).map(action => action.id)).toContain(
      heldReview.id,
    )
    expect((await readStaffActionHistory(staff.id)).map(action => action.id)).not.toContain(
      oldOrdinary.id,
    )

    const sevenYearsLater = new Date(window.upperBoundDate)
    sevenYearsLater.setUTCFullYear(sevenYearsLater.getUTCFullYear() + 7)
    expect(await cleanupModerationRecords({ ...options, now: sevenYearsLater })).toMatchObject({
      deleted: 1,
    })
    expect((await readStaffActionHistory(staff.id)).map(action => action.id)).not.toContain(
      oldReview.id,
    )
    expect((await readStaffActionHistory(staff.id)).map(action => action.id)).toContain(
      heldReview.id,
    )

    await releasePreservationHoldForTest(holdId, staff.id)
    expect(await cleanupModerationRecords({ ...options, now: sevenYearsLater })).toMatchObject({
      deleted: 1,
    })
    expect((await readStaffActionHistory(staff.id)).map(action => action.id)).not.toContain(
      heldReview.id,
    )
  })
})
