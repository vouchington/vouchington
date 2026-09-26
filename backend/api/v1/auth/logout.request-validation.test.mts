import { describe, it, expect } from 'vitest'

import { postLogoutExpectingRejection } from '@voucha/test-helpers/api/v1/auth/logout-rejection'
import { isSessionRevoked } from '@services/jwt-session'

// Covers the post-parse runtime request-contract validation added for issue #322, layered on top
// of logout's existing manual web-push-binding checks (see logout.test.mts for those). A JSON
// body that parses and is a plain object, but doesn't match the generated `LogoutRequest` schema
// (a wrong-typed field, or a field the schema doesn't declare), now gets a bounded 422 before the
// route's manual parsing/session-lookup logic runs. See
// backend/services/runtime-request-validation for the shared registry these tests exercise.
describe('POST /api/v1/auth/logout - request contract validation', () => {
  it('returns 422 for a wrong-typed push binding field without revoking the session', async () => {
    const { sid } = await postLogoutExpectingRejection({
      body: { web_push_endpoint: 123, web_push_subscription_id: 456 },
      expectedStatus: 422,
    })

    await expect(isSessionRevoked(sid)).resolves.toBe(false)
  })

  it('returns 422 for an unknown push binding field before clearing cookies', async () => {
    await postLogoutExpectingRejection({
      body: {
        web_push_endpoint: 'https://push.example.test/subscription',
        web_push_subscription_id: crypto.randomUUID(),
        foo: 'bar',
      },
      expectedStatus: 422,
    })
  })
})
