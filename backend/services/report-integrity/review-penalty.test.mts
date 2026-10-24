import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  insertTestReportAbusePenalty,
  setTestReportAbusePenaltyReviewDueAt,
} from '@voucha/test-helpers/entities/report-integrity'
import { getReportAbusePenaltyReviewsDue, reviewReportAbusePenalty } from './review-penalty.mts'

describe('report abuse penalty annual review', () => {
  it('surfaces a due active penalty and advances its deadline exactly once', async () => {
    const staff = await createTestUser()
    const target = await createTestUser()
    const penaltyId = await insertTestReportAbusePenalty({
      userId: target.id,
      createdById: staff.id,
    })
    await setTestReportAbusePenaltyReviewDueAt(penaltyId, new Date('2025-01-01T00:00:00Z'))

    expect((await getReportAbusePenaltyReviewsDue()).results.map(row => row.id)).toContain(
      penaltyId,
    )
    const reviewed = await reviewReportAbusePenalty(penaltyId, staff.id)
    expect(reviewed).toMatchObject({ id: penaltyId, reviewed_by_id: staff.id })
    expect(reviewed.reviewed_at).not.toBeNull()
    expect(reviewed.review_due_at.getTime()).toBeGreaterThan(Date.now())
    await expect(reviewReportAbusePenalty(penaltyId, staff.id)).rejects.toMatchObject({
      status: 404,
    })
    expect((await getReportAbusePenaltyReviewsDue()).results.map(row => row.id)).not.toContain(
      penaltyId,
    )
  })
})
