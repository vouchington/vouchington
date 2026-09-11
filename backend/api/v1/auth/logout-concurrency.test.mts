import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  createDeviceAndSessionTokens,
  isSessionRevoked,
  logoutCleanupLease,
} from '@services/jwt-session'
import * as notifications from '@services/notifications'
import { upsertWebPushSubscription } from '@services/notifications'
import { v7 } from 'uuid'

describe('POST /api/v1/auth/logout concurrent replay', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not clean an exact binding submitted after a bodyless logout revokes the session', async () => {
    const user = await createTestUser()
    const tokens = await createDeviceAndSessionTokens({ did: v7(), sid: v7(), uid: user.id })
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const subscription = await upsertWebPushSubscription({
      userId: user.id,
      endpoint,
      p256dh: 'a'.repeat(32),
      auth: 'b'.repeat(16),
    })
    const cleanup = vi.spyOn(notifications, 'deleteExactWebPushSubscription')
    const request = () =>
      createRequest()
        .post('/api/v1/auth/logout')
        .set('Cookie', [`dt=${tokens.deviceToken.token}`, `st=${tokens.sessionToken.token}`])
        .set('Sec-Fetch-Site', 'same-origin')

    await request().expect(204)
    await expect(isSessionRevoked(tokens.sessionToken.payload.sid)).resolves.toBe(true)

    await request()
      .send({ web_push_endpoint: endpoint, web_push_subscription_id: subscription.id })
      .expect(204)

    expect(cleanup).not.toHaveBeenCalled()
  })

  it('keeps cookies when an active lease cannot complete, then permits a retry', async () => {
    const user = await createTestUser()
    const tokens = await createDeviceAndSessionTokens({ did: v7(), sid: v7(), uid: user.id })
    const sid = tokens.sessionToken.payload.sid
    const owner = await logoutCleanupLease.reserve(sid, 90, 'stalled-owner')
    expect(owner).toEqual({ state: 'reserved', token: 'stalled-owner' })
    const request = () =>
      createRequest()
        .post('/api/v1/auth/logout')
        .set('Cookie', [`dt=${tokens.deviceToken.token}`, `st=${tokens.sessionToken.token}`])
        .set('Sec-Fetch-Site', 'same-origin')

    const blocked = await request().expect(500)
    expect(blocked.headers['set-cookie']).toBeUndefined()
    await expect(isSessionRevoked(sid)).resolves.toBe(false)

    await logoutCleanupLease.release(sid, 'stalled-owner')
    const recovered = await request().expect(204)
    expect(recovered.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('dt=;'), expect.stringContaining('st=;')]),
    )
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })
})
