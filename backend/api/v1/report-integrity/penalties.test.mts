import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUserDirect,
  getTestReportAbusePenaltiesByUserId,
  getTestUserBadFaithReporterAt,
  insertTestReportAbusePenalty,
  insertTestReportIntegrityFlag,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { applyReportAbusePenalty } from '@services/report-integrity/apply-penalty'
import { clearJwtStale, isJwtStale } from '@services/jwt-session/invalidation'

describe('report-integrity penalties API', () => {
  const randomUsername = () => `test-ri-pen-${randomBytes(4).toString('hex')}`

  let admin: PrivateUser
  let member: PrivateUser
  let moderator: PrivateUser
  let support: PrivateUser

  beforeAll(async () => {
    ;[admin, member, moderator, support] = await Promise.all([
      createTestUser({ administrator: true, username: randomUsername() }),
      createTestUser({ administrator: false, username: randomUsername() }),
      createTestUser({ extraRoles: ['moderator'], username: randomUsername() }),
      createTestUser({ extraRoles: ['customer_support'], username: randomUsername() }),
    ])
  }, 60_000)

  function getNonAdmin(role: 'member' | 'moderator' | 'support'): PrivateUser {
    return { member, moderator, support }[role]
  }

  describe('GET /api/v1/report-integrity/penalties', () => {
    it('returns 401 when not authenticated', async () => {
      await createRequest().get('/api/v1/report-integrity/penalties').expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.get('/api/v1/report-integrity/penalties').expect(403)
    })

    it('rejects invalid status, user_id, source_flag_id, and cursor inputs', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/report-integrity/penalties?status=invalid').expect(422)
      await request.get('/api/v1/report-integrity/penalties?user_id=invalid').expect(422)
      await request.get('/api/v1/report-integrity/penalties?source_flag_id=invalid').expect(422)
      await request.get('/api/v1/report-integrity/penalties?after=invalid').expect(400)
    })

    it('lists all penalties by default and filters active and revoked rows', async () => {
      const user = await createTestUser({ username: randomUsername() })
      const activeId = await insertTestReportAbusePenalty({
        userId: user.id,
        createdById: admin.id,
      })
      const revokedId = await insertTestReportAbusePenalty({
        userId: user.id,
        createdById: admin.id,
        revokedAt: new Date(),
        revokedById: admin.id,
      })
      const request = createRequest()
      await request.authenticateAs(admin)

      const all = await request
        .get(`/api/v1/report-integrity/penalties?user_id=${user.id}`)
        .expect(200)
      expect(all.body.results.map((penalty: { id: string }) => penalty.id)).toEqual(
        expect.arrayContaining([activeId, revokedId]),
      )
      const active = await request
        .get(`/api/v1/report-integrity/penalties?user_id=${user.id}&status=active`)
        .expect(200)
      expect(active.body.results).toEqual([expect.objectContaining({ id: activeId })])
      const revoked = await request
        .get(`/api/v1/report-integrity/penalties?user_id=${user.id}&status=revoked`)
        .expect(200)
      expect(revoked.body.results).toEqual([expect.objectContaining({ id: revokedId })])
    }, 60_000)

    it('filters by user and source flag without leaking dirty database rows', async () => {
      const [user, otherUser] = await Promise.all([
        createTestUser({ username: randomUsername() }),
        createTestUser({ username: randomUsername() }),
      ])
      const [flagId, otherFlagId] = await Promise.all([
        insertTestReportIntegrityFlag({
          reportedUserId: otherUser!.id,
          reporterUserIds: [user!.id],
        }),
        insertTestReportIntegrityFlag({
          reportedUserId: user!.id,
          reporterUserIds: [otherUser!.id],
        }),
      ])
      const expectedId = await insertTestReportAbusePenalty({
        userId: user!.id,
        createdById: admin.id,
        sourceFlagId: flagId,
      })
      await insertTestReportAbusePenalty({
        userId: otherUser!.id,
        createdById: admin.id,
        sourceFlagId: otherFlagId,
      })
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/report-integrity/penalties?user_id=${user!.id}&source_flag_id=${flagId}`)
        .expect(200)
      expect(response.body.results).toEqual([expect.objectContaining({ id: expectedId })])
    }, 60_000)

    it('paginates without gaps or duplicates and rejects a cursor under changed filters', async () => {
      const user = await createTestUser({ username: randomUsername() })
      const ids = []
      for (let index = 0; index < 3; index += 1) {
        ids.push(await insertTestReportAbusePenalty({ userId: user.id, createdById: admin.id }))
      }
      const request = createRequest()
      await request.authenticateAs(admin)
      const first = await request
        .get(`/api/v1/report-integrity/penalties?user_id=${user.id}&limit=2`)
        .expect(200)
      const second = await request
        .get(
          `/api/v1/report-integrity/penalties?user_id=${user.id}&limit=2&after=${first.body.page_info.end_cursor}`,
        )
        .expect(200)
      const traversed = [...first.body.results, ...second.body.results].map(
        (penalty: { id: string }) => penalty.id,
      )
      expect(traversed).toEqual(ids.toReversed())
      expect(new Set(traversed).size).toBe(3)
      await request
        .get(
          `/api/v1/report-integrity/penalties?user_id=${user.id}&status=active&limit=2&after=${first.body.page_info.end_cursor}`,
        )
        .expect(400)
    }, 60_000)
  })

  describe('DELETE /api/v1/report-integrity/penalties/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.delete(`/api/v1/report-integrity/penalties/${uuidv7()}`).expect(401)
    }, 60_000)

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.delete(`/api/v1/report-integrity/penalties/${uuidv7()}`).expect(403)
    })

    it('returns 404 for unknown penalty UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.delete(`/api/v1/report-integrity/penalties/${uuidv7()}`).expect(404)
    }, 60_000)

    it('revokes an active penalty and returns the result', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const reporterUser = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser!.id,
        reporterUserIds: [reporterUser!.id],
        reporterCount: 5,
      })

      const { penalties } = await applyReportAbusePenalty(admin.id, flagId)
      expect(penalties).toHaveLength(1)
      const penaltyId = penalties[0]!.id

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request
        .delete(`/api/v1/report-integrity/penalties/${penaltyId}`)
        .expect(200)

      expect(res.body).toHaveProperty('penaltyId', penaltyId)
      expect(res.body).toHaveProperty('userId', reporterUser!.id)
      expect(res.body.penalty).toMatchObject({
        id: penaltyId,
        user_id: reporterUser!.id,
        revoked_by_id: admin.id,
      })
      expect(res.body.penalty.revoked_at).not.toBeNull()
    }, 60_000)

    it('returns the authoritative revoked penalty while preserving legacy identifiers', async () => {
      const user = await createTestUser({ username: randomUsername() })
      const penaltyId = await insertTestReportAbusePenalty({
        userId: user.id,
        createdById: admin.id,
      })
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .delete(`/api/v1/report-integrity/penalties/${penaltyId}`)
        .expect(200)
      expect(response.body).toEqual(
        expect.objectContaining({
          penaltyId,
          userId: user.id,
          penalty: expect.objectContaining({
            id: penaltyId,
            user_id: user.id,
            reason: 'mass_report_campaign',
            created_by_id: admin.id,
            revoked_by_id: admin.id,
          }),
        }),
      )
    }, 60_000)

    it('allows exactly one concurrent revocation and preserves trust-stamp side effects', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const reporterUser = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser!.id,
        reporterUserIds: [reporterUser!.id],
      })
      const { penalties } = await applyReportAbusePenalty(admin.id, flagId)
      expect(await getTestUserBadFaithReporterAt(reporterUser!.id)).not.toBeNull()
      const [request1, request2] = [createRequest(), createRequest()]
      await Promise.all([request1.authenticateAs(admin), request2.authenticateAs(admin)])
      const responses = await Promise.all([
        request1.delete(`/api/v1/report-integrity/penalties/${penalties[0]!.id}`),
        request2.delete(`/api/v1/report-integrity/penalties/${penalties[0]!.id}`),
      ])
      expect(responses.map(response => response.status).toSorted()).toEqual([200, 404])
      expect(await getTestUserBadFaithReporterAt(reporterUser!.id)).toBeNull()
    }, 60_000)

    it('serializes concurrent revocation of two active penalties for the same user', async () => {
      const [target1, target2, reporter] = await Promise.all([
        createTestUserDirect({ username: randomUsername() }),
        createTestUserDirect({ username: randomUsername() }),
        createTestUserDirect({ username: randomUsername() }),
      ])
      const [flag1, flag2] = await Promise.all([
        insertTestReportIntegrityFlag({
          reportedUserId: target1!.id,
          reporterUserIds: [reporter!.id],
        }),
        insertTestReportIntegrityFlag({
          reportedUserId: target2!.id,
          reporterUserIds: [reporter!.id],
        }),
      ])
      const [{ penalties: penalties1 }, { penalties: penalties2 }] = await Promise.all([
        applyReportAbusePenalty(admin.id, flag1),
        applyReportAbusePenalty(admin.id, flag2),
      ])
      await expect.poll(() => isJwtStale(reporter!.id)).toBe(true)
      await clearJwtStale(reporter!.id)

      const [request1, request2] = [createRequest(), createRequest()]
      await Promise.all([request1.authenticateAs(admin), request2.authenticateAs(admin)])
      const responses = await Promise.all([
        request1.delete(`/api/v1/report-integrity/penalties/${penalties1[0]!.id}`),
        request2.delete(`/api/v1/report-integrity/penalties/${penalties2[0]!.id}`),
      ])

      expect(responses.map(response => response.status)).toEqual([200, 200])
      const persisted = await getTestReportAbusePenaltiesByUserId(reporter!.id)
      expect(persisted.filter(penalty => penalty.revoked_at !== null)).toHaveLength(2)
      expect(await getTestUserBadFaithReporterAt(reporter!.id)).toBeNull()
      await expect.poll(() => isJwtStale(reporter!.id)).toBe(true)
      expect(await isJwtStale(target1!.id)).toBe(false)
      expect(await isJwtStale(target2!.id)).toBe(false)
    }, 60_000)
  })
})
