import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'

// Covers the post-parse runtime request-contract validation added for issue #322 on the public
// broker POST .../authorizations route. The existing manual `ctx.assert(..., 422, ...)` checks
// for an invalid purpose/callback_mode value are unchanged (see auth-oauth-broker.test.mts);
// `validateRequestContract` runs after them, against the same body, to reject unrecognized
// top-level fields and a mistyped `completion_proof_challenge` that the manual checks don't
// catch. See backend/services/runtime-request-validation for the shared registry.
describe('POST /api/v1/auth/oauth/:provider/authorizations - request contract validation', () => {
  it('returns 422 for an unknown top-level field', async () => {
    await createRequest()
      .post('/api/v1/auth/oauth/github/authorizations')
      .send({ purpose: 'authenticate', callback_mode: 'web', extra: 'unexpected' })
      .expect(422)
  })

  it('returns 422 for a non-string completion_proof_challenge', async () => {
    await createRequest()
      .post('/api/v1/auth/oauth/github/authorizations')
      .send({ purpose: 'authenticate', callback_mode: 'native', completion_proof_challenge: 123 })
      .expect(422)
  })
})
