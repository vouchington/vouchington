import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { getReportAbusePenaltyByIdFromPrimary } from '@services/report-integrity'
import {
  insertTestReportAbusePenalty,
  setTestReportAbusePenaltyReviewDueAt,
} from '@voucha/test-helpers/entities/report-integrity'

const path = '/api/v1/report-integrity/penalties'

describe('report abuse penalty review API', () => {
  it('rejects a suspended administrator before recording a review', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    const penaltyId = await insertTestReportAbusePenalty({
      userId: target.id,
      createdById: admin.id,
    })
    await setTestReportAbusePenaltyReviewDueAt(penaltyId, new Date('2025-01-01T00:00:00Z'))
    await suspendTestUser(admin.id)
    try {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.post(`${path}/${penaltyId}/reviews`).expect(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      expect(await getReportAbusePenaltyByIdFromPrimary(penaltyId)).toMatchObject({
        reviewed_at: null,
        reviewed_by_id: null,
      })
    } finally {
      await unsuspendTestUser(admin.id)
    }
  })

  it('admits only administrators, reviews a due active penalty, and rejects replay', async () => {
    const [admin, member, target] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser(),
    ])
    const dueId = await insertTestReportAbusePenalty({ userId: target.id, createdById: admin.id })
    const futureId = await insertTestReportAbusePenalty({
      userId: target.id,
      createdById: admin.id,
    })
    await setTestReportAbusePenaltyReviewDueAt(dueId, new Date('2025-01-01T00:00:00Z'))
    await setTestReportAbusePenaltyReviewDueAt(futureId, new Date('2030-01-01T00:00:00Z'))

    await createRequest().get(`${path}/review-due`).expect(401)
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    await memberRequest.get(`${path}/review-due`).expect(403)
    await memberRequest.post(`${path}/${dueId}/reviews`).expect(403)

    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    const due = await adminRequest.get(`${path}/review-due`).expect(200)
    expect(due.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: dueId, user_username: target.username }),
      ]),
    )
    expect(due.body.results.map((penalty: { id: string }) => penalty.id)).toContain(dueId)
    expect(due.body.results.map((penalty: { id: string }) => penalty.id)).not.toContain(futureId)
    await adminRequest.post(`${path}/invalid/reviews`).expect(422)
    await adminRequest.post(`${path}/${uuidv7()}/reviews`).expect(404)

    const reviewed = await adminRequest.post(`${path}/${dueId}/reviews`).expect(200)
    expect(reviewed.body.penalty).toMatchObject({ id: dueId, reviewed_by_id: admin.id })
    expect(new Date(reviewed.body.penalty.review_due_at).getTime()).toBeGreaterThan(Date.now())
    await adminRequest.post(`${path}/${dueId}/reviews`).expect(404)
    const remaining = await adminRequest.get(`${path}/review-due`).expect(200)
    expect(remaining.body.results.map((penalty: { id: string }) => penalty.id)).not.toContain(dueId)
  }, 30_000)
})
