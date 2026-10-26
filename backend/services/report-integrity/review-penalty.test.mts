import { describe, expect, it } from 'vitest'
import {
  encodeScopedPreciseTimestampCursor,
  decodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
import { createTestUser, softDeleteTestUserAndWaitBeforeCommit } from '@voucha/test-helpers'
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
    const prefix = new Date(946684800000 + Number.parseInt(target.id.slice(-8), 16))
      .toISOString()
      .slice(0, -1)
    await setTestReportAbusePenaltyReviewDueAt(penaltyId, `${prefix}001Z`)
    const after = encodeScopedPreciseTimestampCursor(
      `${prefix}000Z`,
      penaltyId,
      'report-integrity:penalty-reviews:due:asc',
    )

    expect((await getReportAbusePenaltyReviewsDue({ after })).results.map(row => row.id)).toContain(
      penaltyId,
    )
    const reviewed = await reviewReportAbusePenalty(penaltyId, staff.id)
    expect(reviewed).toMatchObject({ id: penaltyId, reviewed_by_id: staff.id })
    expect(reviewed.reviewed_at).not.toBeNull()
    expect(reviewed.review_due_at.getTime()).toBeGreaterThan(Date.now())
    await expect(reviewReportAbusePenalty(penaltyId, staff.id)).rejects.toMatchObject({
      status: 404,
    })
    expect(
      (await getReportAbusePenaltyReviewsDue({ after })).results.map(row => row.id),
    ).not.toContain(penaltyId)
  })

  it('keeps a due penalty with an unlinked soft-deleted profile', async () => {
    const target = await createTestUser()
    const penaltyId = await insertTestReportAbusePenalty({
      userId: target.id,
      createdById: target.id,
    })
    const prefix = new Date(946684800000 + Number.parseInt(target.id.slice(-8), 16))
      .toISOString()
      .slice(0, -1)
    await setTestReportAbusePenaltyReviewDueAt(penaltyId, `${prefix}001Z`)
    const after = encodeScopedPreciseTimestampCursor(
      `${prefix}000Z`,
      penaltyId,
      'report-integrity:penalty-reviews:due:asc',
    )
    await softDeleteTestUserAndWaitBeforeCommit(target.id, Promise.resolve())

    expect((await getReportAbusePenaltyReviewsDue({ after })).results).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: penaltyId, user_username: null })]),
    )
  })
  it('navigates tied deadlines without rounding away PostgreSQL microseconds', async () => {
    const target = await createTestUser()
    const firstId = await insertTestReportAbusePenalty({
      userId: target.id,
      createdById: target.id,
    })
    const secondId = await insertTestReportAbusePenalty({
      userId: target.id,
      createdById: target.id,
    })
    const thirdId = await insertTestReportAbusePenalty({
      userId: target.id,
      createdById: target.id,
    })
    // Randomized fixture position keeps concurrent dirty-database runs independent.
    const prefix = new Date(946684800000 + Number.parseInt(target.id.slice(-8), 16))
      .toISOString()
      .slice(0, -1)
    const firstTimestamp = `${prefix}001Z`
    const tiedTimestamp = `${prefix}002Z`
    await setTestReportAbusePenaltyReviewDueAt(firstId, firstTimestamp)
    await setTestReportAbusePenaltyReviewDueAt(secondId, tiedTimestamp)
    await setTestReportAbusePenaltyReviewDueAt(thirdId, tiedTimestamp)
    const scope = 'report-integrity:penalty-reviews:due:asc'
    const start = encodeScopedPreciseTimestampCursor(`${prefix}000Z`, firstId, scope)
    const first = await getReportAbusePenaltyReviewsDue({ after: start, limit: 1 })
    expect(first.results.map(row => row.id)).toEqual([firstId])
    expect(first.page_info.has_next_page).toBe(true)
    expect(
      decodeScopedPreciseTimestampCursor(first.page_info.end_cursor!, scope, 'Invalid test cursor')
        .timestamp,
    ).toBe(firstTimestamp)
    const second = await getReportAbusePenaltyReviewsDue({
      after: first.page_info.end_cursor!,
      limit: 1,
    })
    const orderedTies = [secondId, thirdId].toSorted()
    expect(second.results.map(row => row.id)).toEqual([orderedTies[0]])
    const third = await getReportAbusePenaltyReviewsDue({
      after: second.page_info.end_cursor!,
      limit: 1,
    })
    expect(third.results.map(row => row.id)).toEqual([orderedTies[1]])
    await expect(
      getReportAbusePenaltyReviewsDue({
        after: encodeScopedPreciseTimestampCursor(firstTimestamp, firstId, 'other-review-queue'),
        limit: 1,
      }),
    ).rejects.toThrow('Invalid penalty review cursor')
  })
})
