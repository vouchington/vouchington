import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createRandomString } from '@voucha/test-helpers'
import { v7 } from 'uuid'

// Covers the post-parse runtime request-contract validation added for issue #322 on the two
// authenticated Bluesky linking routes. Both routes already run full manual field-by-field
// `ctx.assert(..., 400, ...)` checks for missing/blank/malformed values -- those checks are
// unchanged and keep their 400 status. `validateRequestContract` runs only after them, against
// the raw body, purely to reject unrecognized top-level fields the manual checks don't catch.
// See backend/services/runtime-request-validation for the shared registry these tests exercise.
function fakeHandle(): string {
  return `user-${createRandomString(6)}.bsky.social`
}

describe('Bluesky linking routes - request contract validation', () => {
  describe('POST /api/v1/auth/bluesky/link', () => {
    it('returns 401, not 422, for a malformed body without auth', async () => {
      await createRequest()
        .post('/api/v1/auth/bluesky/link')
        .send({ handle: 123, extra: 'unexpected' })
        .expect(401)
    })

    it('returns 422 for an unknown top-level field once authenticated', async () => {
      const request = createRequest()
      await request.authenticateAs(await createTestUser())

      await request
        .post('/api/v1/auth/bluesky/link')
        .send({ handle: fakeHandle(), extra: 'unexpected' })
        .expect(422)
    })
  })

  describe('POST /api/v1/auth/bluesky/link-completions', () => {
    it('returns 401, not 422, for a malformed body without auth', async () => {
      await createRequest()
        .post('/api/v1/auth/bluesky/link-completions')
        .send({ flow_id: 123, extra: 'unexpected' })
        .expect(401)
    })

    it('returns 422 for an unknown top-level field once authenticated, before any lookup', async () => {
      const request = createRequest()
      await request.authenticateAs(await createTestUser())

      // Syntactically valid (but nonexistent) values -- the manual 400-status format checks all
      // pass, so the schema's unrecognized-field rejection fires before the completion lookup.
      await request
        .post('/api/v1/auth/bluesky/link-completions')
        .send({
          flow_id: v7(),
          completion_proof_verifier: 'A'.repeat(43),
          completion_token: 'fake-token',
          extra: 'unexpected',
        })
        .expect(422)
    })
  })
})
