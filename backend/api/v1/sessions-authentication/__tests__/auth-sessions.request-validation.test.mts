import { beforeAll, describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createUniqueTestEmail, insertEmailAddressLoginToken } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  deleteTestUserSession,
  getActiveTestUserSessions,
  getTestUserSessionById,
  insertTestUserSession,
} from '../../../../test-helpers/entities/user-sessions.mts'
import '../index.mts'

// Covers the request-contract validation on the protected session routes (issue #1515). Both are
// protected: requireAuth() runs before the schema check, so an anonymous malformed call keeps a
// bare 401 with no schema diagnostic. For the list query the pagination parser still runs first and
// keeps its 400 and its limit clamping; the generated contract then validates the values it
// settled on, all before the current session row is repaired.
describe('Auth sessions routes - request contract validation', () => {
  let authCookies: string[]
  let currentSessionId: string
  let userId: string

  beforeAll(async () => {
    const emailAddress = createUniqueTestEmail('sessions-validation')
    const loginToken = v7()
    await insertEmailAddressLoginToken(emailAddress, loginToken)
    const login = await createRequest()
      .post('/api/v1/auth/email-address/login')
      .send({ emailAddress, token: loginToken })
      .expect(200)
    const cookies = login.headers['set-cookie'] as unknown as string[]
    authCookies = cookies.filter(cookie => cookie.startsWith('dt=') || cookie.startsWith('st='))
    currentSessionId = login.body.session.sid as string
    userId = login.body.user.id as string
  }, 15_000)

  describe('GET /api/v1/auth/sessions', () => {
    it('returns a bare 401 without a schema diagnostic for an anonymous malformed query', async () => {
      const response = await createRequest()
        .get('/api/v1/auth/sessions?limit=abc&after=x&after=y')
        .expect(401)

      expect(response.body.message).toBe('Unauthorized')
    })

    it.each(['limit=abc', 'limit=0', 'limit=-1', 'limit=1.5', 'after=', 'after=a&after=b'])(
      'rejects %s with 400 before repairing the current session row',
      async query => {
        await deleteTestUserSession(currentSessionId)

        await createRequest()
          .get(`/api/v1/auth/sessions?${query}`)
          .set('Cookie', authCookies)
          .expect(400)

        await expect(getTestUserSessionById(currentSessionId)).resolves.toBeNull()
      },
    )

    it('rejects a malformed cursor with 400 before repairing the current session row', async () => {
      await deleteTestUserSession(currentSessionId)

      await createRequest()
        .get('/api/v1/auth/sessions?after=not-a-real-cursor')
        .set('Cookie', authCookies)
        .expect(400)

      await expect(getTestUserSessionById(currentSessionId)).resolves.toBeNull()
    })

    it('clamps an oversized limit and still repairs the current session row for a valid query', async () => {
      await deleteTestUserSession(currentSessionId)

      const response = await createRequest()
        .get('/api/v1/auth/sessions?limit=500')
        .set('Cookie', authCookies)
        .expect(200)

      expect(response.body.results[0].id).toBe(currentSessionId)
      await expect(getTestUserSessionById(currentSessionId)).resolves.toMatchObject({
        id: currentSessionId,
        revoked_at: null,
      })
    })
  })

  describe('DELETE /api/v1/auth/sessions/:id', () => {
    it('returns a bare 401 for an anonymous malformed id', async () => {
      const response = await createRequest().delete('/api/v1/auth/sessions/not-a-uuid').expect(401)

      expect(response.body.message).toBe('Unauthorized')
    })

    it('returns 422 for a malformed id without revoking any session', async () => {
      const before = await getActiveTestUserSessions(userId)

      await createRequest()
        .delete('/api/v1/auth/sessions/not-a-uuid')
        .set('Cookie', authCookies)
        .expect(422)

      await expect(getActiveTestUserSessions(userId)).resolves.toHaveLength(before.length)
    })

    it('still revokes another session and returns 404 for an unknown one', async () => {
      const other = await insertTestUserSession({
        userId,
        sessionId: v7(),
        deviceId: v7(),
        deviceName: 'Validation laptop',
      })

      await createRequest()
        .delete(`/api/v1/auth/sessions/${other.id}`)
        .set('Cookie', authCookies)
        .expect(204)
      await expect(getTestUserSessionById(other.id)).resolves.toMatchObject({
        revoked_at: expect.any(Date),
      })

      await createRequest()
        .delete(`/api/v1/auth/sessions/${v7()}`)
        .set('Cookie', authCookies)
        .expect(404)
    })
  })
})
