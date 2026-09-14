import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUserDirect,
  insertTestReportIntegrityFlag,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('report-integrity flags API', () => {
  const randomUsername = () => `test-ri-flags-${randomBytes(4).toString('hex')}`

  let admin: PrivateUser
  let member: PrivateUser
  let moderator: PrivateUser
  let reporterUser: PrivateUser
  let support: PrivateUser

  beforeAll(async () => {
    ;[admin, member, moderator, reporterUser, support] = await Promise.all([
      createTestUser({ administrator: true, username: randomUsername() }),
      createTestUser({ administrator: false, username: randomUsername() }),
      createTestUser({ extraRoles: ['moderator'], username: randomUsername() }),
      createTestUserDirect({ username: randomUsername() }),
      createTestUser({ extraRoles: ['customer_support'], username: randomUsername() }),
    ])
  }, 60_000)

  function getNonAdmin(role: 'member' | 'moderator' | 'support'): PrivateUser {
    return { member, moderator, support }[role]
  }

  describe('GET /api/v1/report-integrity/flags', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/report-integrity/flags').expect(401)
    }, 60_000)

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.get('/api/v1/report-integrity/flags').expect(403)
    })

    it('returns paginated flag list for admin', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.get('/api/v1/report-integrity/flags').expect(200)

      expect(res.body).toHaveProperty('results')
      expect(res.body).toHaveProperty('page_info')
      expect(Array.isArray(res.body.results)).toBe(true)
    }, 60_000)

    it('seeded flag appears in results', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      await insertTestReportIntegrityFlag({ reportedUserId: targetUser!.id, reporterCount: 6 })

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.get('/api/v1/report-integrity/flags').expect(200)

      expect(Array.isArray(res.body.results)).toBe(true)
      const found = res.body.results.some((f: any) => f.reported_user_id === targetUser!.id)
      expect(found).toBe(true)
    }, 60_000)

    it('filters by status=pending returns only unresolved flags', async () => {
      const pendingTarget = await createTestUserDirect({ username: randomUsername() })
      await insertTestReportIntegrityFlag({
        reportedUserId: pendingTarget!.id,
        reporterCount: 5,
        resolvedAt: null,
        resolution: null,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.get('/api/v1/report-integrity/flags?status=pending').expect(200)

      expect(res.body.results.every((f: any) => f.resolved_at === null)).toBe(true)
    }, 60_000)

    it('filters by status=resolved returns only resolved flags', async () => {
      const resolvedTarget = await createTestUserDirect({ username: randomUsername() })
      await insertTestReportIntegrityFlag({
        reportedUserId: resolvedTarget!.id,
        reporterCount: 5,
        resolvedAt: new Date(),
        resolution: 'dismissed',
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.get('/api/v1/report-integrity/flags?status=resolved').expect(200)

      expect(res.body.results.every((f: any) => f.resolved_at !== null)).toBe(true)
    }, 60_000)

    it('returns pending and resolved flags when status is omitted', async () => {
      const pendingTarget = await createTestUserDirect({ username: randomUsername() })
      const resolvedTarget = await createTestUserDirect({ username: randomUsername() })
      const pendingFlagId = await insertTestReportIntegrityFlag({
        reportedUserId: pendingTarget!.id,
        resolvedAt: null,
        resolution: null,
      })
      const resolvedFlagId = await insertTestReportIntegrityFlag({
        reportedUserId: resolvedTarget!.id,
        resolvedAt: new Date(),
        resolution: 'dismissed',
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.get('/api/v1/report-integrity/flags').expect(200)
      const ids = new Set(res.body.results.map((flag: any) => flag.id))

      expect(ids).toContain(pendingFlagId)
      expect(ids).toContain(resolvedFlagId)
    }, 60_000)
  })

  describe('GET /api/v1/report-integrity/flags/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get(`/api/v1/report-integrity/flags/${uuidv7()}`).expect(401)
    }, 60_000)

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.get(`/api/v1/report-integrity/flags/${uuidv7()}`).expect(403)
    })

    it('returns 404 for unknown flag UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/report-integrity/flags/${uuidv7()}`).expect(404)
    }, 60_000)

    it('returns the flag for a valid ID', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser!.id,
        reporterCount: 7,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.get(`/api/v1/report-integrity/flags/${flagId}`).expect(200)

      expect(res.body.flag).toHaveProperty('id', flagId)
      expect(res.body.flag).toHaveProperty('flag_type', 'mass_report_suspected')
      expect(res.body.flag).toHaveProperty('reported_user_id', targetUser!.id)
    }, 60_000)
  })

  describe('PATCH /api/v1/report-integrity/flags/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .patch(`/api/v1/report-integrity/flags/${uuidv7()}`)
        .set('Content-Type', 'application/json')
        .expect(401)
    }, 60_000)

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request
        .patch(`/api/v1/report-integrity/flags/${uuidv7()}`)
        .send({ resolution: 'dismissed' })
        .expect(403)
    })

    it('resolves a flag with dismissed resolution and returns updated flag', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser!.id,
        reporterCount: 5,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request
        .patch(`/api/v1/report-integrity/flags/${flagId}`)
        .send({ resolution: 'dismissed' })
        .expect(200)

      expect(res.body.flag).toHaveProperty('id', flagId)
      expect(res.body.flag.resolved_at).not.toBeNull()
      expect(res.body.flag).toHaveProperty('resolution', 'dismissed')
      expect(res.body.flag).toHaveProperty('resolved_by_id', admin.id)
    }, 60_000)

    it('returns 422 when resolution is penalized (must use penalties endpoint)', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser!.id,
        reporterCount: 5,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch(`/api/v1/report-integrity/flags/${flagId}`)
        .send({ resolution: 'penalized' })
        .expect(422)
    }, 60_000)

    it('returns 422 for invalid resolution value', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser!.id,
        reporterCount: 5,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch(`/api/v1/report-integrity/flags/${flagId}`)
        .send({ resolution: 'invalid_value' })
        .expect(422)
    }, 60_000)
  })

  describe('POST /api/v1/report-integrity/flags/:id/penalties', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.post(`/api/v1/report-integrity/flags/${uuidv7()}/penalties`).expect(401)
    }, 60_000)

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.post(`/api/v1/report-integrity/flags/${uuidv7()}/penalties`).expect(403)
    })

    it('returns 404 for unknown flag UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post(`/api/v1/report-integrity/flags/${uuidv7()}/penalties`).expect(404)
    }, 60_000)

    it('applies penalties and returns the authoritative resolved flag with penalty details', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser!.id,
        reporterUserIds: [reporterUser.id],
        reporterCount: 5,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request
        .post(`/api/v1/report-integrity/flags/${flagId}/penalties`)
        .expect(201)

      expect(res.body).toHaveProperty('penalized_user_count', 1)
      expect(Array.isArray(res.body.penalties)).toBe(true)
      expect(res.body.penalties).toHaveLength(1)
      expect(res.body.penalties[0]).toHaveProperty('user_id', reporterUser.id)
      expect(res.body.flag).toMatchObject({
        id: flagId,
        resolution: 'penalized',
        resolved_by_id: admin.id,
      })
      expect(res.body.flag.resolved_at).not.toBeNull()
    }, 60_000)

    it('returns 409 when flag is already resolved (second POST)', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const anotherReporter = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser!.id,
        reporterUserIds: [anotherReporter!.id],
        reporterCount: 5,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post(`/api/v1/report-integrity/flags/${flagId}/penalties`).expect(201)

      const request2 = createRequest()
      await request2.authenticateAs(admin)
      await request2.post(`/api/v1/report-integrity/flags/${flagId}/penalties`).expect(409)
    }, 60_000)
  })
})
