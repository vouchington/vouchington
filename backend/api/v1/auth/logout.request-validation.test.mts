import { describe, it, expect } from 'vitest'
import { v7 } from 'uuid'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createDeviceAndSessionTokens, isSessionRevoked } from '@services/jwt-session'

// Covers the post-parse runtime request-contract validation added for issue #322, layered on top
// of logout's existing manual web-push-binding checks (see logout.test.mts for those). A JSON
// body that parses and is a plain object, but doesn't match the generated `LogoutRequest` schema
// (a wrong-typed field, or a field the schema doesn't declare), now gets a bounded 422 before the
// route's manual parsing/session-lookup logic runs. See
// backend/services/runtime-request-validation for the shared registry these tests exercise.
describe('POST /api/v1/auth/logout - request contract validation', () => {
  async function createTestCookies(): Promise<{ dtCookie: string; stCookie: string; sid: string }> {
    const user = await createTestUser()
    const sid = v7()
    const tokens = await createDeviceAndSessionTokens({ did: v7(), sid, uid: user.id })
    return {
      dtCookie: `dt=${tokens.deviceToken.token}`,
      stCookie: `st=${tokens.sessionToken.token}`,
      sid,
    }
  }

  it('returns 422 for a wrong-typed push binding field without revoking the session', async () => {
    const { dtCookie, stCookie, sid } = await createTestCookies()
    const response = await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [dtCookie, stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ web_push_endpoint: 123, web_push_subscription_id: 456 })
      .expect(422)

    expect(response.headers['set-cookie']).toBeUndefined()
    await expect(isSessionRevoked(sid)).resolves.toBe(false)
  })

  it('returns 422 for an unknown push binding field before clearing cookies', async () => {
    const { dtCookie, stCookie } = await createTestCookies()
    const response = await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [dtCookie, stCookie])
      .set('Sec-Fetch-Site', 'same-origin')
      .send({
        web_push_endpoint: 'https://push.example.test/subscription',
        web_push_subscription_id: crypto.randomUUID(),
        foo: 'bar',
      })
      .expect(422)

    expect(response.headers['set-cookie']).toBeUndefined()
  })
})
