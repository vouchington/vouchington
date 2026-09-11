import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { overrideDynamicConfigFieldsForTest, createTestUser } from '@voucha/test-helpers'
import { getTestUserSessionById } from '../../../test-helpers/entities/user-sessions.mts'
import {
  createDeviceAndSessionTokens,
  isSessionRevoked,
  verifyDeviceAndSessionTokens,
} from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { v7 } from 'uuid'
import { listWebPushSubscriptionsPage, upsertWebPushSubscription } from '@services/notifications'

let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

async function createTestCookies(): Promise<{
  dtCookie: string
  stCookie: string
  userId: string
}> {
  const user = await createTestUser()
  const tokens = await createDeviceAndSessionTokens({
    did: v7(),
    sid: v7(),
    uid: user.id,
  })
  return {
    dtCookie: `dt=${tokens.deviceToken.token}`,
    stCookie: `st=${tokens.sessionToken.token}`,
    userId: user.id,
  }
}

describe('POST /api/v1/auth/logout', () => {
  beforeEach(async () => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  it('accepts an empty JSON request without relying on a content-length header', async () => {
    await createRequest()
      .post('/api/v1/auth/logout')
      .set('Content-Type', 'application/json')
      .unset('Content-Length')
      .expect(204)
  })

  it('rejects malformed JSON before clearing cookies', async () => {
    const { dtCookie, stCookie } = await createTestCookies()
    const response = await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [dtCookie, stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400)

    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('rejects a partial web push binding before clearing cookies', async () => {
    const { dtCookie, stCookie } = await createTestCookies()
    const response = await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [dtCookie, stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ web_push_endpoint: 'https://push.example.test/subscription' })
      .expect(400)

    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('rejects an endpoint URL that cannot be parsed', async () => {
    const { dtCookie, stCookie } = await createTestCookies()
    const response = await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [dtCookie, stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .send({
        web_push_endpoint: 'https://[',
        web_push_subscription_id: crypto.randomUUID(),
      })
      .expect(400)

    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('rejects JSON null before revoking the session or clearing cookies', async () => {
    const { dtCookie, stCookie } = await createTestCookies()
    const response = await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [dtCookie, stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(400)

    expect(response.headers['set-cookie']).toBeUndefined()
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: dtCookie.slice(3),
      sessionToken: stCookie.slice(3),
    })
    expect(verified).not.toBe(false)
    await expect(isSessionRevoked((verified as Exclude<typeof verified, false>).sid)).resolves.toBe(
      false,
    )
  })

  it('canonicalizes and deactivates only the submitted current push generation', async () => {
    const { dtCookie, stCookie, userId } = await createTestCookies()
    const endpointPath = crypto.randomUUID()
    const endpoint = `https://push.example.test/${endpointPath}`
    const subscription = await upsertWebPushSubscription({
      userId,
      endpoint,
      p256dh: 'a'.repeat(32),
      auth: 'b'.repeat(16),
    })

    await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [dtCookie, stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .send({
        web_push_endpoint: `https://push.example.test:443/${endpointPath}`,
        web_push_subscription_id: subscription.id,
      })
      .expect(204)

    const page = await listWebPushSubscriptionsPage(userId)
    expect(page.results).toEqual([])
  })

  it('treats a stale generation binding as a no-op', async () => {
    const { dtCookie, stCookie, userId } = await createTestCookies()
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const stale = await upsertWebPushSubscription({
      userId,
      endpoint,
      p256dh: 'a'.repeat(32),
      auth: 'b'.repeat(16),
    })
    const current = await upsertWebPushSubscription({
      userId,
      endpoint,
      p256dh: 'c'.repeat(32),
      auth: 'd'.repeat(16),
    })

    await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [dtCookie, stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .send({
        web_push_endpoint: endpoint,
        web_push_subscription_id: stale.id,
      })
      .expect(204)

    const page = await listWebPushSubscriptionsPage(userId)
    expect(page.results).toEqual([expect.objectContaining({ id: current.id, endpoint })])
  })

  it('does not let a replayed revoked session delete a push generation', async () => {
    const { dtCookie, stCookie, userId } = await createTestCookies()
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const subscription = await upsertWebPushSubscription({
      userId,
      endpoint,
      p256dh: 'a'.repeat(32),
      auth: 'b'.repeat(16),
    })
    const request = () =>
      createRequest()
        .post('/api/v1/auth/logout')
        .set('Cookie', [dtCookie, stCookie])
        .set('Sec-Fetch-Site', 'same-origin')

    await request().expect(204)
    await request()
      .send({
        web_push_endpoint: endpoint,
        web_push_subscription_id: subscription.id,
      })
      .expect(204)

    const page = await listWebPushSubscriptionsPage(userId)
    expect(page.results).toEqual([expect.objectContaining({ id: subscription.id, endpoint })])
  })

  it('should clear authentication cookies', async () => {
    const { dtCookie, stCookie } = await createTestCookies()

    // Now logout
    const logoutResponse = await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [dtCookie, stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .expect(204)

    // Check that cookies are cleared (set to empty with maxAge=0)
    const logoutCookies = logoutResponse.headers['set-cookie'] as unknown as string[] | undefined
    expect(logoutCookies).toBeDefined()
    expect(
      logoutCookies?.some(
        c => c.includes('dt=;') || (c.includes('dt=') && c.includes('max-age=0')),
      ),
    ).toBe(true)
    expect(
      logoutCookies?.some(
        c => c.includes('st=;') || (c.includes('st=') && c.includes('max-age=0')),
      ),
    ).toBe(true)

    // Signature verification still returns the cryptographically valid payload. Request context
    // checks the Valkey revocation flag before treating the session as authenticated.
    const deviceToken = dtCookie.slice(3)
    const sessionToken = stCookie.slice(3)
    const verified = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })
    expect(verified).not.toBe(false)
    const sid = (verified as Exclude<typeof verified, false>).sid
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
    await expect(getTestUserSessionById(sid)).resolves.toMatchObject({
      revoked_at: expect.any(Date),
    })
  })

  it('should work even without cookies', async () => {
    // Logout without being logged in should not error
    await createRequest().post('/api/v1/auth/logout').expect(204)
  })

  it('clears anonymous session cookies without storing a revocation marker', async () => {
    const tokens = await createDeviceAndSessionTokens({ did: v7(), uid: null })

    await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [`dt=${tokens.deviceToken.token}`, `st=${tokens.sessionToken.token}`])
      .set('Sec-Fetch-Site', 'same-origin')
      .expect(204)

    await expect(isSessionRevoked(tokens.sessionToken.payload.sid)).resolves.toBe(false)
  })

  it('should not be blocked by route rate limits', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_write: 1,
      anon_write_ttl: 60,
      anon_sensitive: 1,
      anon_sensitive_ttl: 60,
    })

    await createRequest().post('/api/v1/auth/logout').expect(204)
    await createRequest().post('/api/v1/auth/logout').expect(204)
    await createRequest().post('/api/v1/auth/logout').expect(204)
  })

  it('should not revoke the session when only the session cookie is present', async () => {
    const { dtCookie, stCookie } = await createTestCookies()

    await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .expect(204)

    // st alone is not enough to revoke; logout keeps revocation paired with dt/st
    // verification so a leaked session cookie cannot be used for revocation DoS.
    const deviceToken = dtCookie.slice(3)
    const sessionToken = stCookie.slice(3)
    const verified = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })
    expect(verified).not.toBe(false)
    await expect(isSessionRevoked((verified as Exclude<typeof verified, false>).sid)).resolves.toBe(
      false,
    )
  })
})
