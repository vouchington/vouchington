import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import {
  arrangeReportIntegrityFlagPage,
  createOwnedIntegrityFlagQuery,
} from '@voucha/test-helpers/integrity-flag-page-fixtures'
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
  })

  async function createFlag(
    options: Omit<Parameters<typeof insertTestReportIntegrityFlag>[0], 'reportedUserId'> = {},
  ) {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const flagId = await insertTestReportIntegrityFlag({
      ...options,
      reportedUserId: targetUser.id,
    })
    return { targetUser, flagId }
  }

  const ownedFlagQuery = createOwnedIntegrityFlagQuery('report-integrity-flags')
  async function adminRequest() {
    const request = createRequest()
    await request.authenticateAs(admin)
    return request
  }

  function getNonAdmin(role: 'member' | 'moderator' | 'support'): PrivateUser {
    return { member, moderator, support }[role]
  }

  describe('GET /api/v1/report-integrity/flags', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/report-integrity/flags').expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.get('/api/v1/report-integrity/flags').expect(403)
    })

    it('returns paginated flag list for admin', async () => {
      const { flagId } = await createFlag()
      const request = await adminRequest()
      const res = await request
        .get('/api/v1/report-integrity/flags')
        .query(ownedFlagQuery(flagId))
        .expect(200)
      expect(res.body.results.map((flag: any) => flag.id)).toEqual([flagId])
      expect(res.body).toHaveProperty('results')
      expect(res.body).toHaveProperty('page_info')
      expect(Array.isArray(res.body.results)).toBe(true)
    })

    it('seeded flag appears in results', async () => {
      const { targetUser, flagId } = await createFlag({ reporterCount: 6 })
      const request = await adminRequest()
      const res = await request
        .get('/api/v1/report-integrity/flags')
        .query(ownedFlagQuery(flagId))
        .expect(200)
      expect(Array.isArray(res.body.results)).toBe(true)
      const found = res.body.results.some((f: any) => f.reported_user_id === targetUser!.id)
      expect(found).toBe(true)
    })

    it('filters by status=pending returns only unresolved flags', async () => {
      const { flagId } = await createFlag({ reporterCount: 5, resolvedAt: null, resolution: null })
      const request = await adminRequest()
      const res = await request
        .get('/api/v1/report-integrity/flags')
        .query(ownedFlagQuery(flagId, 'pending'))
        .expect(200)
      expect(res.body.results.map((flag: any) => flag.id)).toEqual([flagId])
      expect(res.body.results.every((f: any) => f.resolved_at === null)).toBe(true)
      const opposite = await request
        .get('/api/v1/report-integrity/flags')
        .query(ownedFlagQuery(flagId, 'resolved'))
        .expect(200)
      expect(opposite.body.results.map((flag: any) => flag.id)).not.toContain(flagId)
    })

    it('filters by status=resolved returns only resolved flags', async () => {
      const { flagId } = await createFlag({
        reporterCount: 5,
        resolvedAt: new Date(),
        resolution: 'dismissed',
      })
      const request = await adminRequest()
      const res = await request
        .get('/api/v1/report-integrity/flags')
        .query(ownedFlagQuery(flagId, 'resolved'))
        .expect(200)
      expect(res.body.results.map((flag: any) => flag.id)).toEqual([flagId])
      expect(res.body.results.every((f: any) => f.resolved_at !== null)).toBe(true)
      const opposite = await request
        .get('/api/v1/report-integrity/flags')
        .query(ownedFlagQuery(flagId, 'pending'))
        .expect(200)
      expect(opposite.body.results.map((flag: any) => flag.id)).not.toContain(flagId)
    })

    it('returns pending and resolved flags when status is omitted', async () => {
      const pending = await createFlag({ resolvedAt: null, resolution: null })
      const resolved = await createFlag({ resolvedAt: null, resolution: null })
      const pendingOwner = { id: pending.flagId, targetId: pending.targetUser.id }
      const resolvedOwner = { id: resolved.flagId, targetId: resolved.targetUser.id }
      const request = await adminRequest()
      await expect(
        arrangeReportIntegrityFlagPage(
          pendingOwner,
          { ...resolvedOwner, targetId: uuidv7() },
          new Date(),
        ),
      ).rejects.toThrow('Mixed page layout did not update exactly both owned pending flags')
      for (const original of [pending, resolved]) {
        const unchanged = await request
          .get(`/api/v1/report-integrity/flags/${original.flagId}`)
          .expect(200)
        expect(unchanged.body.flag).toMatchObject({
          id: original.flagId,
          reported_user_id: original.targetUser.id,
          resolved_at: null,
          resolution: null,
        })
      }
      const { pendingId: pendingFlagId, resolvedId: resolvedFlagId } =
        await arrangeReportIntegrityFlagPage(pendingOwner, resolvedOwner, new Date())
      const res = await request
        .get('/api/v1/report-integrity/flags')
        .query({ ...ownedFlagQuery(resolvedFlagId), limit: 2 })
        .expect(200)
      const ids = new Set(res.body.results.map((flag: any) => flag.id))
      expect(ids).toContain(pendingFlagId)
      expect(ids).toContain(resolvedFlagId)
      expect(res.body.results.map((flag: any) => flag.id)).toEqual([resolvedFlagId, pendingFlagId])
      expect(res.body.results[0].resolved_at).not.toBeNull()
      expect(res.body.results[1].resolved_at).toBeNull()
    })
  })

  describe('GET /api/v1/report-integrity/flags/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get(`/api/v1/report-integrity/flags/${uuidv7()}`).expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.get(`/api/v1/report-integrity/flags/${uuidv7()}`).expect(403)
    })

    it('returns 404 for unknown flag UUID', async () => {
      const request = await adminRequest()
      await request.get(`/api/v1/report-integrity/flags/${uuidv7()}`).expect(404)
    })

    it('returns the flag for a valid ID', async () => {
      const { targetUser, flagId } = await createFlag({ reporterCount: 7 })
      const request = await adminRequest()
      const res = await request.get(`/api/v1/report-integrity/flags/${flagId}`).expect(200)
      expect(res.body.flag).toHaveProperty('id', flagId)
      expect(res.body.flag).toHaveProperty('flag_type', 'mass_report_suspected')
      expect(res.body.flag).toHaveProperty('reported_user_id', targetUser!.id)
    })
  })

  describe('PATCH /api/v1/report-integrity/flags/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .patch(`/api/v1/report-integrity/flags/${uuidv7()}`)
        .set('Content-Type', 'application/json')
        .expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request
        .patch(`/api/v1/report-integrity/flags/${uuidv7()}`)
        .send({ resolution: 'dismissed' })
        .expect(403)
    })

    it('resolves a flag with dismissed resolution and returns updated flag', async () => {
      const { flagId } = await createFlag({ reporterCount: 5 })
      const request = await adminRequest()
      const res = await request
        .patch(`/api/v1/report-integrity/flags/${flagId}`)
        .send({ resolution: 'dismissed' })
        .expect(200)
      expect(res.body.flag).toHaveProperty('id', flagId)
      expect(res.body.flag.resolved_at).not.toBeNull()
      expect(res.body.flag).toHaveProperty('resolution', 'dismissed')
      expect(res.body.flag).toHaveProperty('resolved_by_id', admin.id)
    })

    it('returns 422 when resolution is penalized (must use penalties endpoint)', async () => {
      const { flagId } = await createFlag({ reporterCount: 5 })
      const request = await adminRequest()
      const res = await request
        .patch(`/api/v1/report-integrity/flags/${flagId}`)
        .send({ resolution: 'penalized' })
        .expect(422)
      expect(res.body.message).toContain('POST /api/v1/report-integrity/flags/:id/penalties')
    })

    it('returns 422 for invalid resolution value', async () => {
      const { flagId } = await createFlag({ reporterCount: 5 })
      const request = await adminRequest()
      await request
        .patch(`/api/v1/report-integrity/flags/${flagId}`)
        .send({ resolution: 'invalid_value' })
        .expect(422)
    })
  })

  describe('POST /api/v1/report-integrity/flags/:id/penalties', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.post(`/api/v1/report-integrity/flags/${uuidv7()}/penalties`).expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.post(`/api/v1/report-integrity/flags/${uuidv7()}/penalties`).expect(403)
    })

    it('returns 404 for unknown flag UUID', async () => {
      const request = await adminRequest()
      await request.post(`/api/v1/report-integrity/flags/${uuidv7()}/penalties`).expect(404)
    })

    it('applies penalties and returns the authoritative resolved flag with penalty details', async () => {
      const { flagId } = await createFlag({
        reporterUserIds: [reporterUser.id],
        reporterCount: 5,
      })
      const request = await adminRequest()
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
    })

    it('returns 409 when flag is already resolved (second POST)', async () => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const anotherReporter = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser!.id,
        reporterUserIds: [anotherReporter!.id],
        reporterCount: 5,
      })
      const request = await adminRequest()
      await request.post(`/api/v1/report-integrity/flags/${flagId}/penalties`).expect(201)
      const request2 = createRequest()
      await request2.authenticateAs(admin)
      await request2.post(`/api/v1/report-integrity/flags/${flagId}/penalties`).expect(409)
    })
  })
})
