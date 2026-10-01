import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, getModeratorActionRowsForTest } from '@voucha/test-helpers'

type Method = 'get' | 'put' | 'delete'

const ID = randomUUID()
const OPERATIONS: Array<[Method, string]> = [
  ['get', `/api/v1/users/${ID}/preservation-hold`],
  ['put', `/api/v1/users/${ID}/preservation-hold`],
  ['delete', `/api/v1/users/${ID}/preservation-hold`],
]

describe('user preservation hold routes', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('preservation hold routes are administrator-only', () => {
    it.each(OPERATIONS)('%s returns 401 for anonymous callers', async (method, url) => {
      await createRequest()[method](url).send({ reference: 'matter' }).expect(401)
    })

    it.each(OPERATIONS)('%s returns 403 for members and moderators', async (method, url) => {
      const [member, moderator, target] = await Promise.all([
        createTestUser(),
        createTestUser({ extraRoles: ['moderator'] }),
        createTestUser(),
      ])
      const path = url.replace(ID, target.id)
      for (const caller of [member, moderator]) {
        const request = createRequest()
        await request.authenticateAs(caller)
        const response = await request[method](path).send({ reference: 'matter' })
        expect(response.status).toBe(403)
      }
    })
  })

  describe('preservation hold routes', () => {
    it('blocks account deletion with 409 while open and allows 202 after release', async () => {
      const [admin, user] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
      ])
      const adminRequest = createRequest()
      await adminRequest.authenticateAs(admin)
      const userRequest = createRequest()
      await userRequest.authenticateAs(user)

      const placed = await adminRequest
        .put(`/api/v1/users/${user.id}/preservation-hold`)
        .send({ reference: ' Matter 2026-0042 ' })
        .expect(200)
      expect(placed.body.hold).toMatchObject({
        account_user_id: user.id,
        reference: 'Matter 2026-0042',
        placed_by_id: admin.id,
        released_at: null,
        released_by_id: null,
      })

      const blocked = await userRequest.delete(`/api/v1/users/${user.id}`).expect(409)
      expect(blocked.body.message ?? blocked.text).toContain('Account deletion is blocked')
      const adminBlocked = await adminRequest.delete(`/api/v1/users/${user.id}`)
      expect(adminBlocked.status).toBe(409)

      const listed = await adminRequest
        .get(`/api/v1/users/${user.id}/preservation-hold`)
        .expect(200)
      expect(listed.body.holds).toEqual([placed.body.hold])

      const released = await adminRequest
        .delete(`/api/v1/users/${user.id}/preservation-hold`)
        .expect(200)
      expect(released.body.hold).toMatchObject({
        id: placed.body.hold.id,
        released_by_id: admin.id,
        released_at: expect.any(String),
      })
      await userRequest.delete(`/api/v1/users/${user.id}`).expect(202)
    })

    it('audits placement and release without the reference', async () => {
      const [admin, user] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
      ])
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .put(`/api/v1/users/${user.id}/preservation-hold`)
        .send({ reference: 'Confidential-Ref-91' })
        .expect(200)
      await request.delete(`/api/v1/users/${user.id}/preservation-hold`).expect(200)

      const audit = await getModeratorActionRowsForTest({ targetUserId: user.id })
      expect(audit.map(row => [row.action_type, row.actor_id])).toEqual([
        ['preservation_hold_release', admin.id],
        ['preservation_hold_place', admin.id],
      ])
      expect(JSON.stringify(audit)).not.toContain('Confidential-Ref-91')
    })

    it('returns 409 for a second open hold and for releasing when none is open', async () => {
      const [admin, user] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
      ])
      const request = createRequest()
      await request.authenticateAs(admin)

      await request.delete(`/api/v1/users/${user.id}/preservation-hold`).expect(409)
      await request
        .put(`/api/v1/users/${user.id}/preservation-hold`)
        .send({ reference: 'one' })
        .expect(200)
      await request
        .put(`/api/v1/users/${user.id}/preservation-hold`)
        .send({ reference: 'two' })
        .expect(409)
    })

    it('rejects malformed requests with 422 and never echoes the reference', async () => {
      const [admin, user] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
      ])
      const request = createRequest()
      await request.authenticateAs(admin)
      const url = `/api/v1/users/${user.id}/preservation-hold`
      const oversized = `Secret-${'x'.repeat(600)}`

      for (const body of [
        {},
        { reference: 5 },
        { reference: 'ok', extra: 1 },
        { reference: '  ' },
      ]) {
        await request.put(url).send(body).expect(422)
      }
      const tooLong = await request.put(url).send({ reference: oversized }).expect(422)
      expect(tooLong.text).not.toContain('Secret-')
      await request
        .put('/api/v1/users/not-a-uuid/preservation-hold')
        .send({ reference: 'x' })
        .expect(422)
      await request.get('/api/v1/users/not-a-uuid/preservation-hold').expect(422)
      await request.delete('/api/v1/users/not-a-uuid/preservation-hold').expect(422)
      expect((await request.get(url).expect(200)).body.holds).toEqual([])
    })

    it('returns 404 when placing a hold on an unknown user', async () => {
      const admin = await createTestUser({ administrator: true })
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .put(`/api/v1/users/${randomUUID()}/preservation-hold`)
        .send({ reference: 'matter' })
        .expect(404)
    })
  })
})
