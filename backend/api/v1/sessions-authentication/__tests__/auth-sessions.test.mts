import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createUniqueTestEmail,
  overrideDynamicConfigFieldsForTest,
  createTestUser,
  insertEmailAddressLoginToken,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  deleteTestUserSession,
  getActiveTestUserSessions,
  getTestUserSessionById,
  insertTestUserSession,
} from '../../../../test-helpers/entities/user-sessions.mts'
import '../index.mts'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import {
  getJwtRevokedKey,
  isSessionRevoked,
  revokeAllAuthenticatedSessions,
  touchAuthenticatedSession,
  upsertAuthenticatedSession,
} from '@services/jwt-session'
import { v7 } from 'uuid'
import { decodeJwt } from 'jose'

describe('Auth sessions routes', () => {
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeEach(async () => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  it('lists active sessions, marks the current session, and restores a missing current row', async () => {
    const emailAddress = createUniqueTestEmail('sessions')
    const loginToken = v7()
    await insertEmailAddressLoginToken(emailAddress, loginToken)

    const loginResponse = await createRequest()
      .post('/api/v1/auth/email-address/login')
      .send({ emailAddress, token: loginToken })
      .expect(200)

    const loginCookies = loginResponse.headers['set-cookie'] as unknown as string[]
    const dtCookie = loginCookies.find(cookie => cookie.startsWith('dt='))
    const stCookie = loginCookies.find(cookie => cookie.startsWith('st='))
    expect(dtCookie).toBeDefined()
    expect(stCookie).toBeDefined()

    const currentSessionId = loginResponse.body.session.sid as string
    const userId = loginResponse.body.user.id as string

    const secondSession = await insertTestUserSession({
      userId,
      sessionId: v7(),
      deviceId: v7(),
      deviceName: 'Test laptop',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0',
      ipAddress: '203.0.113.10',
    })

    const listResponse = await createRequest()
      .get('/api/v1/auth/sessions')
      .set('Cookie', [dtCookie!, stCookie!])
      .expect(200)

    expect(listResponse.body.results).toHaveLength(2)
    expect(listResponse.body.results[0].id).toBe(currentSessionId)
    expect(listResponse.body.page_info).toEqual({
      has_next_page: false,
      end_cursor: null,
      start_cursor: expect.any(String),
    })

    const currentSession = listResponse.body.results.find(
      (session: { id: string }) => session.id === currentSessionId,
    )
    const otherSession = listResponse.body.results.find(
      (session: { id: string }) => session.id === secondSession.id,
    )

    expect(currentSession).toMatchObject({
      id: currentSessionId,
      is_current: true,
    })
    expect(otherSession).toMatchObject({
      id: secondSession.id,
      device_name: 'Test laptop',
      is_current: false,
    })

    await deleteTestUserSession(currentSessionId)

    const repairedResponse = await createRequest()
      .get('/api/v1/auth/sessions')
      .set('Cookie', [dtCookie!, stCookie!])
      .expect(200)

    expect(
      repairedResponse.body.results.some(
        (session: { id: string }) => session.id === currentSessionId,
      ),
    ).toBe(true)
    await expect(getTestUserSessionById(currentSessionId)).resolves.toMatchObject({
      id: currentSessionId,
      user_id: userId,
      revoked_at: null,
    })
    const repairedSession = await getTestUserSessionById(currentSessionId)
    const sessionJwt = decodeJwt(loginResponse.body.st.token as string)
    expect(repairedSession!.expires_at.getTime()).toBe((sessionJwt.exp as number) * 1000)
    await expect(getActiveTestUserSessions(userId)).resolves.toHaveLength(2)
  })

  it('revokes a single session row and marks its Valkey revocation key', async () => {
    const emailAddress = createUniqueTestEmail('sessions-delete')
    const loginToken = v7()
    await insertEmailAddressLoginToken(emailAddress, loginToken)

    const loginResponse = await createRequest()
      .post('/api/v1/auth/email-address/login')
      .send({ emailAddress, token: loginToken })
      .expect(200)
    const loginCookies = loginResponse.headers['set-cookie'] as unknown as string[]
    const dtCookie = loginCookies.find(cookie => cookie.startsWith('dt='))
    const stCookie = loginCookies.find(cookie => cookie.startsWith('st='))
    const userId = loginResponse.body.user.id as string

    const otherSession = await insertTestUserSession({
      userId,
      sessionId: v7(),
      deviceId: v7(),
      deviceName: 'Travel laptop',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) Chrome/126.0',
      ipAddress: '198.51.100.20',
    })

    await createRequest()
      .delete(`/api/v1/auth/sessions/${otherSession.id}`)
      .set('Cookie', [dtCookie!, stCookie!])
      .expect(204)

    await expect(getTestUserSessionById(otherSession.id)).resolves.toMatchObject({
      id: otherSession.id,
      user_id: userId,
      revoked_at: expect.any(Date),
    })
    await expect(isSessionRevoked(otherSession.id)).resolves.toBe(true)

    await sessionValkeyClient.unlink([getJwtRevokedKey(otherSession.id)])

    await createRequest()
      .delete(`/api/v1/auth/sessions/${otherSession.id}`)
      .set('Cookie', [dtCookie!, stCookie!])
      .expect(204)

    await expect(isSessionRevoked(otherSession.id)).resolves.toBe(true)
  })

  it('touches an active session without revoking it', async () => {
    const user = await createTestUser()
    const session = await insertTestUserSession({
      userId: user!.id,
      sessionId: v7(),
      deviceId: v7(),
      deviceName: 'Touch test device',
    })

    await touchAuthenticatedSession(session.id)

    await expect(getTestUserSessionById(session.id)).resolves.toMatchObject({
      id: session.id,
      revoked_at: null,
    })
  })

  it('preserves an existing device name when session repair has no device metadata', async () => {
    const user = await createTestUser()
    const session = await insertTestUserSession({
      userId: user!.id,
      sessionId: v7(),
      deviceId: v7(),
      deviceName: 'Original laptop',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) Chrome/126.0',
    })

    await upsertAuthenticatedSession(user!.id, {
      sid: session.id,
      deviceId: session.device_id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    await expect(getTestUserSessionById(session.id)).resolves.toMatchObject({
      device_name: 'Original laptop',
    })

    await upsertAuthenticatedSession(user!.id, {
      sid: session.id,
      deviceId: session.device_id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      userAgent: 'node',
      ipAddress: '127.0.0.1',
      refreshMetadata: false,
    })

    await expect(getTestUserSessionById(session.id)).resolves.toMatchObject({
      device_name: 'Original laptop',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) Chrome/126.0',
      ip_address: null,
    })
  })

  it('revokes all active sessions for the current user', async () => {
    const emailAddress = createUniqueTestEmail('sessions-revoke-all')
    const loginToken = v7()
    await insertEmailAddressLoginToken(emailAddress, loginToken)

    const loginResponse = await createRequest()
      .post('/api/v1/auth/email-address/login')
      .send({ emailAddress, token: loginToken })
      .expect(200)
    const loginCookies = loginResponse.headers['set-cookie'] as unknown as string[]
    const dtCookie = loginCookies.find(cookie => cookie.startsWith('dt='))
    const stCookie = loginCookies.find(cookie => cookie.startsWith('st='))
    const userId = loginResponse.body.user.id as string
    const currentSessionId = loginResponse.body.session.sid as string

    const otherSession = await insertTestUserSession({
      userId,
      sessionId: v7(),
      deviceId: v7(),
      deviceName: 'Backup laptop',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0',
      ipAddress: '192.0.2.20',
    })

    await createRequest()
      .post('/api/v1/auth/sessions/revocations')
      .set('Cookie', [dtCookie!, stCookie!])
      .expect(204)

    await expect(getTestUserSessionById(currentSessionId)).resolves.toMatchObject({
      revoked_at: expect.any(Date),
    })
    await expect(getTestUserSessionById(otherSession.id)).resolves.toMatchObject({
      revoked_at: expect.any(Date),
    })
    await expect(isSessionRevoked(currentSessionId)).resolves.toBe(true)
    await expect(isSessionRevoked(otherSession.id)).resolves.toBe(true)

    await sessionValkeyClient.unlink([
      getJwtRevokedKey(currentSessionId),
      getJwtRevokedKey(otherSession.id),
    ])

    await revokeAllAuthenticatedSessions(userId)

    await expect(isSessionRevoked(currentSessionId)).resolves.toBe(true)
    await expect(isSessionRevoked(otherSession.id)).resolves.toBe(true)
  })

  it('revokes authenticated sessions that are missing from the session registry', async () => {
    const emailAddress = createUniqueTestEmail('sessions-revoke-legacy')
    const loginToken = v7()
    await insertEmailAddressLoginToken(emailAddress, loginToken)

    const loginResponse = await createRequest()
      .post('/api/v1/auth/email-address/login')
      .send({ emailAddress, token: loginToken })
      .expect(200)
    const loginCookies = loginResponse.headers['set-cookie'] as unknown as string[]
    const dtCookie = loginCookies.find(cookie => cookie.startsWith('dt='))
    const stCookie = loginCookies.find(cookie => cookie.startsWith('st='))
    const currentSessionId = loginResponse.body.session.sid as string
    await deleteTestUserSession(currentSessionId)

    await createRequest()
      .post('/api/v1/auth/sessions/revocations')
      .set('Cookie', [dtCookie!, stCookie!])
      .expect(204)

    const response = await createRequest()
      .get('/api/v1/auth/me')
      .set('Cookie', [dtCookie!, stCookie!])
      .expect(401)

    expect(response.body.error).toBe('Unauthorized')
  })
})
