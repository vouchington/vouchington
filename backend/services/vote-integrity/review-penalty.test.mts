import { describe, expect, it } from 'vitest'
import { createTestUser, softDeleteTestUserAndWaitBeforeCommit } from '@voucha/test-helpers'
import {
  insertTestVoteWeightPenaltyRecord,
  setTestVoteWeightPenaltyReviewDueAt,
} from '@voucha/test-helpers/entities/vote-integrity'
import { getVoteWeightPenaltyReviewsDue, reviewVoteWeightPenalty } from './review-penalty.mts'

describe('vote weight penalty annual review', () => {
  it('surfaces a due active penalty and advances its deadline exactly once', async () => {
    const staff = await createTestUser()
    const target = await createTestUser()
    const penaltyId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: staff.id,
    })
    await setTestVoteWeightPenaltyReviewDueAt(penaltyId, new Date('2025-01-01T00:00:00Z'))

    expect((await getVoteWeightPenaltyReviewsDue()).results.map(row => row.id)).toContain(penaltyId)
    const reviewed = await reviewVoteWeightPenalty(penaltyId, staff.id)
    expect(reviewed).toMatchObject({ id: penaltyId, reviewed_by_id: staff.id })
    expect(reviewed.reviewed_at).not.toBeNull()
    expect(reviewed.review_due_at.getTime()).toBeGreaterThan(Date.now())
    await expect(reviewVoteWeightPenalty(penaltyId, staff.id)).rejects.toMatchObject({
      status: 404,
    })
    expect((await getVoteWeightPenaltyReviewsDue()).results.map(row => row.id)).not.toContain(
      penaltyId,
    )
  })

  it('keeps a due penalty with an unlinked soft-deleted profile', async () => {
    const target = await createTestUser()
    const penaltyId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: target.id,
    })
    await setTestVoteWeightPenaltyReviewDueAt(penaltyId, new Date('2025-01-01T00:00:00Z'))
    await softDeleteTestUserAndWaitBeforeCommit(target.id, Promise.resolve())

    expect((await getVoteWeightPenaltyReviewsDue()).results).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: penaltyId, user_username: null })]),
    )
    expect((await getVoteWeightPenaltyReviewsDue()).results.map(row => row.id)).not.toContain(
      penaltyId,
    )
  })
})
