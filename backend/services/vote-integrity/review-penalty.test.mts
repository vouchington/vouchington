import { describe, expect, it } from 'vitest'
import { paginationConfig } from '@services/pagination'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  encodeScopedPreciseTimestampCursor,
  decodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  hardDeleteTestUser,
  softDeleteTestUserAndWaitBeforeCommit,
} from '@voucha/test-helpers'
import {
  insertTestVoteWeightPenaltyRecord,
  setTestVoteWeightPenaltyReviewDueAt,
} from '@voucha/test-helpers/entities/vote-integrity'
import { getVoteWeightPenaltyReviewsDue, reviewVoteWeightPenalty } from './review-penalty.mts'
import { getVoteWeightPenaltyByIdFromPrimary } from './get-penalties.mts'
import { withRejectedStaffActionHistory } from '@voucha/test-helpers/staff-action-history'

describe('vote weight penalty annual review', () => {
  it('uses the configured default and maximum for direct due-review reads', async () => {
    const target = await createTestUser()
    const prefix = new Date(946684800000 + Number.parseInt(target.id.slice(-8), 16))
      .toISOString()
      .slice(0, -1)
    const ids: string[] = []
    for (let index = 1; index <= 10; index++) {
      const id = await insertTestVoteWeightPenaltyRecord({
        userId: target.id,
        createdById: target.id,
      })
      await setTestVoteWeightPenaltyReviewDueAt(id, `${prefix}${String(index).padStart(3, '0')}Z`)
      ids.push(id)
    }
    const after = encodeScopedPreciseTimestampCursor(
      `${prefix}000Z`,
      ids[0]!,
      'vote-integrity:penalty-reviews:due:asc',
    )
    const restore = overrideDynamicConfigFieldsForTest(paginationConfig, {
      default_limit: 7,
      small_max_limit: 9,
    })
    try {
      const first = await getVoteWeightPenaltyReviewsDue({ after })
      expect(first.results).toHaveLength(7)
      expect(first.page_info.has_next_page).toBe(true)
      expect((await getVoteWeightPenaltyReviewsDue({ after, limit: 9 })).results).toHaveLength(9)
      expect((await getVoteWeightPenaltyReviewsDue({ after, limit: 10 })).results).toHaveLength(9)
    } finally {
      restore()
    }
  })

  it('surfaces a due active penalty and advances its deadline exactly once', async () => {
    const staff = await createTestUser()
    const target = await createTestUser()
    const penaltyId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: staff.id,
    })
    const prefix = new Date(946684800000 + Number.parseInt(target.id.slice(-8), 16))
      .toISOString()
      .slice(0, -1)
    await setTestVoteWeightPenaltyReviewDueAt(penaltyId, `${prefix}001Z`)
    const after = encodeScopedPreciseTimestampCursor(
      `${prefix}000Z`,
      penaltyId,
      'vote-integrity:penalty-reviews:due:asc',
    )

    expect((await getVoteWeightPenaltyReviewsDue({ after })).results.map(row => row.id)).toContain(
      penaltyId,
    )
    const reviewed = await reviewVoteWeightPenalty(penaltyId, staff.id)
    expect(reviewed).toMatchObject({ id: penaltyId, reviewed_by_id: staff.id })
    expect(reviewed.reviewed_at).not.toBeNull()
    expect(reviewed.review_due_at.getTime()).toBeGreaterThan(Date.now())
    await expect(reviewVoteWeightPenalty(penaltyId, staff.id)).rejects.toMatchObject({
      status: 404,
    })
    expect(
      (await getVoteWeightPenaltyReviewsDue({ after })).results.map(row => row.id),
    ).not.toContain(penaltyId)
  })

  it('retains both annual review decisions and the first reviewer after account purge', async () => {
    const firstReviewer = await createTestUser()
    const secondReviewer = await createTestUser()
    const target = await createTestUser()
    const penaltyId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: firstReviewer.id,
    })
    const firstDue = new Date('2001-01-01T00:00:00.000Z')
    const secondDue = new Date('2002-01-01T00:00:00.000Z')
    await setTestVoteWeightPenaltyReviewDueAt(penaltyId, firstDue)

    const first = await reviewVoteWeightPenalty(penaltyId, firstReviewer.id)
    await setTestVoteWeightPenaltyReviewDueAt(penaltyId, secondDue)
    const second = await reviewVoteWeightPenalty(penaltyId, secondReviewer.id)
    await expect(reviewVoteWeightPenalty(penaltyId, secondReviewer.id)).rejects.toMatchObject({
      status: 404,
    })

    const reviewActions = (await getModeratorActionRowsForTest({ targetUserId: target.id }))
      .filter(action => action.action_type === 'vote_integrity_penalty_review')
      .toReversed()
    expect(reviewActions).toHaveLength(2)
    expect(reviewActions.map(action => [action.actor_user_id, action.metadata])).toEqual([
      [
        firstReviewer.id,
        {
          before: { review_due_at: firstDue.toISOString() },
          after: { review_due_at: first.review_due_at.toISOString() },
        },
      ],
      [
        secondReviewer.id,
        {
          before: { review_due_at: secondDue.toISOString() },
          after: { review_due_at: second.review_due_at.toISOString() },
        },
      ],
    ])

    await hardDeleteTestUser(firstReviewer.id)
    const retained = (await getModeratorActionRowsForTest({ targetUserId: target.id })).filter(
      action => action.action_type === 'vote_integrity_penalty_review',
    )
    expect(retained).toHaveLength(2)
    expect(retained.find(action => action.id === reviewActions[0]!.id)?.actor_user_id).toBe(
      firstReviewer.id,
    )

    await hardDeleteTestUser(target.id)
    const afterTargetPurge = (
      await getModeratorActionRowsForTest({ targetUserId: target.id })
    ).filter(action => action.action_type === 'vote_integrity_penalty_review')
    expect(afterTargetPurge).toHaveLength(2)
    expect(afterTargetPurge.map(action => action.vote_weight_penalty_id)).toEqual([null, null])
    expect(afterTargetPurge.map(action => action.target_user_id)).toEqual([target.id, target.id])
  })

  it('rolls back the confirmation when the audit action cannot be written', async () => {
    const reviewer = await createTestUser()
    const target = await createTestUser()
    const penaltyId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: reviewer.id,
    })
    await setTestVoteWeightPenaltyReviewDueAt(penaltyId, new Date('2001-01-01T00:00:00.000Z'))
    const before = await getVoteWeightPenaltyByIdFromPrimary(penaltyId)

    await expect(
      withRejectedStaffActionHistory(query =>
        reviewVoteWeightPenalty(penaltyId, reviewer.id, { query }),
      ),
    ).rejects.toThrow('staff history rejected for test')

    const after = await getVoteWeightPenaltyByIdFromPrimary(penaltyId)
    expect(after).toMatchObject({
      reviewed_at: before!.reviewed_at,
      reviewed_by_id: before!.reviewed_by_id,
      review_due_at: before!.review_due_at,
    })
    expect(
      (await getModeratorActionRowsForTest({ targetUserId: target.id })).filter(
        action => action.action_type === 'vote_integrity_penalty_review',
      ),
    ).toEqual([])
  })

  it('keeps a due penalty with an unlinked soft-deleted profile', async () => {
    const target = await createTestUser()
    const penaltyId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: target.id,
    })
    const prefix = new Date(946684800000 + Number.parseInt(target.id.slice(-8), 16))
      .toISOString()
      .slice(0, -1)
    await setTestVoteWeightPenaltyReviewDueAt(penaltyId, `${prefix}001Z`)
    const after = encodeScopedPreciseTimestampCursor(
      `${prefix}000Z`,
      penaltyId,
      'vote-integrity:penalty-reviews:due:asc',
    )
    await softDeleteTestUserAndWaitBeforeCommit(target.id, Promise.resolve())

    expect((await getVoteWeightPenaltyReviewsDue({ after })).results).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: penaltyId, user_username: null })]),
    )
  })
  it('navigates tied deadlines without rounding away PostgreSQL microseconds', async () => {
    const target = await createTestUser()
    const firstId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: target.id,
    })
    const secondId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: target.id,
    })
    const thirdId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: target.id,
    })
    // Randomized fixture position keeps concurrent dirty-database runs independent.
    const prefix = new Date(946684800000 + Number.parseInt(target.id.slice(-8), 16))
      .toISOString()
      .slice(0, -1)
    const firstTimestamp = `${prefix}001Z`
    const tiedTimestamp = `${prefix}002Z`
    await setTestVoteWeightPenaltyReviewDueAt(firstId, firstTimestamp)
    await setTestVoteWeightPenaltyReviewDueAt(secondId, tiedTimestamp)
    await setTestVoteWeightPenaltyReviewDueAt(thirdId, tiedTimestamp)
    const scope = 'vote-integrity:penalty-reviews:due:asc'
    const start = encodeScopedPreciseTimestampCursor(`${prefix}000Z`, firstId, scope)
    const first = await getVoteWeightPenaltyReviewsDue({ after: start, limit: 1 })
    expect(first.results.map(row => row.id)).toEqual([firstId])
    expect(first.page_info.has_next_page).toBe(true)
    expect(
      decodeScopedPreciseTimestampCursor(first.page_info.end_cursor!, scope, 'Invalid test cursor')
        .timestamp,
    ).toBe(firstTimestamp)
    const second = await getVoteWeightPenaltyReviewsDue({
      after: first.page_info.end_cursor!,
      limit: 1,
    })
    const orderedTies = [secondId, thirdId].toSorted()
    expect(second.results.map(row => row.id)).toEqual([orderedTies[0]])
    const third = await getVoteWeightPenaltyReviewsDue({
      after: second.page_info.end_cursor!,
      limit: 1,
    })
    expect(third.results.map(row => row.id)).toEqual([orderedTies[1]])
    await expect(
      getVoteWeightPenaltyReviewsDue({
        after: encodeScopedPreciseTimestampCursor(firstTimestamp, firstId, 'other-review-queue'),
        limit: 1,
      }),
    ).rejects.toThrow('Invalid penalty review cursor')
  })
})
