import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { v7 } from 'uuid'

// Covers the post-parse runtime request-contract validation added for issue #322 on the public
// POST .../authorizations/:flowId/complete route. `validateRequestContract` runs right after the
// body is parsed -- before the cookie/body completion-token credential is resolved -- so a
// schema-invalid body is rejected with 422 rather than falling through to the 401 "completion
// token is required" the route would otherwise return for a body with no completion_token.
// See backend/services/runtime-request-validation for the shared registry.
describe('POST /api/v1/auth/oauth/authorizations/:flowId/complete - request contract validation', () => {
  it('returns 422, not 401, for an unknown top-level field', async () => {
    await createRequest()
      .post(`/api/v1/auth/oauth/authorizations/${v7()}/complete`)
      .send({ extra: 'unexpected' })
      .expect(422)
  })

  it('returns 422, not 401, for a non-boolean acknowledge', async () => {
    await createRequest()
      .post(`/api/v1/auth/oauth/authorizations/${v7()}/complete`)
      .send({ acknowledge: 'true' })
      .expect(422)
  })
})
