import { describe, it, beforeAll, expect } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createDeviceAndSessionTokens, revokeSession } from '@services/jwt-session'
import { signSessionJwt, verifyDeviceJwt, verifySessionJwt } from '@ts-shared/session-jwt'
import type { PrivateUser } from '@services/users/types'

describe('response-helpers', () => {
  let regularUser: PrivateUser

  beforeAll(async () => {
    regularUser = await createTestUser()
  })

  /**
   * These tests exercise the response-helpers via routes that adopt them:
   * - requireAuth via GET /api/v1/my/notifications
   * - getOptionalAuthAndRateLimit via GET /api/v1/topics
   * - requireAuthAndRateLimit via GET /api/v1/admin/warnings
   * - validateUUIDParam via GET /api/v1/appeals/:id
   * - parseJsonBody via POST /api/v1/markdown/preview
   *
   * The getOptionalAuthAndRateLimit cases use a random no-match `q` marker: /api/v1/topics is the
   * heaviest list endpoint in the app (search, then five requested-topic set aggregates,
   * view_topic_elections, markdown rendering, bookmarks,
   * election votes), none of which this suite tests. A guaranteed-zero-row search still runs the
   * full auth/rate-limit preamble and still returns 200, but skips the hydration fan-out entirely
   * (see the deflake plan referenced at CI run 33808851418 / job 100825925020). Do not "simplify"
   * this back to a bare /api/v1/topics request.
   */

  describe('requireAuth', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/my/notifications').expect(401)
    })

    it('returns 200 when authenticated', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/my/notifications').expect(200)
    })
  })

  describe('getOptionalAuthAndRateLimit', () => {
    const noMatchQuery = `/api/v1/topics?q=${encodeURIComponent(`no-match-${crypto.randomUUID()}`)}`

    it('returns 200 when unauthenticated', async () => {
      const request = createRequest()
      await request.get(noMatchQuery).expect(200)
    })

    it('returns 200 when authenticated', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(noMatchQuery).expect(200)
    })

    it('requests renewal for an expired web session with a signed refresh credential', async () => {
      const personalizedQuery = `/api/v1/topics?q=no-match-${crypto.randomUUID()}`
      const did = v7()
      const sid = v7()
      const userAgent = 'Synthetic browser/1.0'
      const { deviceToken } = await createDeviceAndSessionTokens({
        did,
        sid,
        uid: regularUser.id,
        deviceContext: { user_agent: userAgent },
      })
      const now = Math.floor(Date.now() / 1000)
      const expiredSession = await signSessionJwt(
        { did, sid, uid: regularUser.id },
        { issuedAt: now - 601, expiresIn: now - 1 },
      )
      expect(await verifySessionJwt(expiredSession)).toBeNull()
      expect(await verifyDeviceJwt(deviceToken.token)).toMatchObject({
        client: 'web',
        refresh_uid: regularUser.id,
        refresh_sid: sid,
      })
      const request = createRequest()
      const staleResponse = await request
        .get(personalizedQuery)
        .set('Cookie', `dt=${deviceToken.token}; st=${expiredSession}`)
        .set('User-Agent', userAgent)
        .expect(401)
      expect(staleResponse.body.code).toBe('AUTH_REQUIRED')

      const renewal = await createRequest()
        .patch('/api/v1/session')
        .set('Cookie', `dt=${deviceToken.token}; st=${expiredSession}`)
        .set('User-Agent', userAgent)
        .send({})
        .expect(200)
      expect(renewal.body.session.uid).toBe(regularUser.id)
      const renewedCookies = (renewal.headers['set-cookie'] as unknown as string[])
        .map(value => value.split(';', 1)[0])
        .join('; ')
      const refreshed = await createRequest()
        .get(personalizedQuery)
        .set('Cookie', renewedCookies)
        .set('User-Agent', userAgent)
        .expect(200)
      expect(refreshed.headers['cache-control'] ?? '').not.toContain('public')
    })

    it('does not expose a revoked web session as an authenticated response', async () => {
      const userAgent = 'Synthetic browser/1.0'
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
        did: v7(),
        uid: regularUser.id,
        deviceContext: { user_agent: userAgent },
      })
      await revokeSession(sessionToken.payload.sid)
      const request = createRequest()
      const response = await request
        .get(`/api/v1/topics?q=no-match-${crypto.randomUUID()}`)
        .set('Cookie', `dt=${deviceToken.token}; st=${sessionToken.token}`)
        .set('User-Agent', userAgent)
        .expect(401)
      expect(response.body.code).toBe('AUTH_REQUIRED')
    })

    it('keeps an anonymous device session public', async () => {
      const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did: v7() })
      const request = createRequest()
      await request
        .get(noMatchQuery)
        .set('Cookie', `dt=${deviceToken.token}; st=${sessionToken.token}`)
        .expect(200)
    })
  })

  describe('requireAuthAndRateLimit', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get(`/api/v1/admin/warnings?userId=${regularUser.id}`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/admin/warnings?userId=${regularUser.id}`).expect(403)
    })
  })

  describe('validateUUIDParam', () => {
    it('returns 422 for an invalid UUID in a route param', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/appeals/not-a-uuid').expect(422)
    })

    it('passes through a valid UUID', async () => {
      // A real UUID that doesn't exist should get a 404, not a 422
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/appeals/00000000-0000-0000-0000-000000000099').expect(404)
    })
  })

  describe('parseJsonBody', () => {
    it.each([null, [], 'text', 42, true])(
      'rejects a non-object JSON body before route field access: %#',
      async body => {
        const request = createRequest()
        await request
          .post('/api/v1/email-unsubscribe')
          .set('Content-Type', 'application/json')
          .send(JSON.stringify(body))
          .expect(422)
      },
    )

    it('returns 415 when content-type is not JSON', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post('/api/v1/markdown/preview')
        .set('Content-Type', 'text/plain')
        .send('# Preview')
        .expect(415)
    })
  })
})
