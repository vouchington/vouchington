import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'
import { paginationConfig } from '@services/pagination'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { getVoteWeightPenaltyByIdFromPrimary } from '@services/vote-integrity'
import {
  insertTestVoteWeightPenaltyRecord,
  setTestVoteWeightPenaltyReviewDueAt,
} from '@voucha/test-helpers/entities/vote-integrity'

const path = '/api/v1/vote-integrity/penalties'

describe('vote weight penalty review API', () => {
  it('uses runtime default and maximum bounds for the review-due route', async () => {
    const admin = await createTestUser({ administrator: true })
    const prefix = new Date(946684800000 + Number.parseInt(admin.id.slice(-8), 16))
      .toISOString()
      .slice(0, -1)
    const ids: string[] = []
    for (let index = 1; index <= 10; index++) {
      const id = await insertTestVoteWeightPenaltyRecord({
        userId: admin.id,
        createdById: admin.id,
      })
      await setTestVoteWeightPenaltyReviewDueAt(id, `${prefix}${String(index).padStart(3, '0')}Z`)
      ids.push(id)
    }
    const after = encodeScopedPreciseTimestampCursor(
      `${prefix}000Z`,
      ids[0]!,
      'vote-integrity:penalty-reviews:due:asc',
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    const restore = overrideDynamicConfigFieldsForTest(paginationConfig, {
      default_limit: 7,
      small_max_limit: 9,
    })
    try {
      const first = await request.get(`${path}/review-due`).query({ after }).expect(200)
      expect(first.body.results).toHaveLength(7)
      expect(first.body.page_info.has_next_page).toBe(true)
      const maximum = await request.get(`${path}/review-due`).query({ after, limit: 9 }).expect(200)
      expect(maximum.body.results).toHaveLength(9)
      const clamped = await request
        .get(`${path}/review-due`)
        .query({ after, limit: 10 })
        .expect(200)
      expect(clamped.body.results).toHaveLength(9)
    } finally {
      restore()
    }
  })

  it('rejects a suspended administrator before recording a review', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    const penaltyId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: admin.id,
    })
    await setTestVoteWeightPenaltyReviewDueAt(penaltyId, new Date('2025-01-01T00:00:00Z'))
    await suspendTestUser(admin.id)
    try {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.post(`${path}/${penaltyId}/reviews`).expect(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      expect(await getVoteWeightPenaltyByIdFromPrimary(penaltyId)).toMatchObject({
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
    const dueId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: admin.id,
    })
    const laterDueId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: admin.id,
    })
    const futureId = await insertTestVoteWeightPenaltyRecord({
      userId: target.id,
      createdById: admin.id,
    })
    const prefix = new Date(946684800000 + Number.parseInt(target.id.slice(-8), 16))
      .toISOString()
      .slice(0, -1)
    await setTestVoteWeightPenaltyReviewDueAt(dueId, `${prefix}001Z`)
    await setTestVoteWeightPenaltyReviewDueAt(laterDueId, `${prefix}002Z`)
    const after = encodeScopedPreciseTimestampCursor(
      `${prefix}000Z`,
      dueId,
      'vote-integrity:penalty-reviews:due:asc',
    )
    await setTestVoteWeightPenaltyReviewDueAt(futureId, new Date('2030-01-01T00:00:00Z'))

    await createRequest().get(`${path}/review-due`).expect(401)
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    await memberRequest.get(`${path}/review-due`).expect(403)
    await memberRequest.post(`${path}/${dueId}/reviews`).expect(403)

    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    const due = await adminRequest.get(`${path}/review-due`).query({ after, limit: 1 }).expect(200)
    expect(due.body.results).toHaveLength(1)
    expect(due.body.page_info).toMatchObject({
      has_next_page: true,
      end_cursor: expect.any(String),
      start_cursor: expect.any(String),
    })
    expect(due.body).not.toHaveProperty('has_more')
    const next = await adminRequest
      .get(`${path}/review-due`)
      .query({ after: due.body.page_info.end_cursor, limit: 1 })
      .expect(200)
    expect(next.body.results.map((row: { id: string }) => row.id)).toEqual([laterDueId])
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
    const remaining = await adminRequest
      .get(`${path}/review-due`)
      .query({ after, limit: 1 })
      .expect(200)
    expect(remaining.body.results.map((penalty: { id: string }) => penalty.id)).not.toContain(dueId)
  }, 30_000)
})
