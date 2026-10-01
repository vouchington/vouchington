import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'

const ROUTE = '/api/v1/memberships/apple-app-store/notifications'

// This route is specialized ingress: Apple signs the payload as a JWS, so the shared JSON contract
// adapter is intentionally absent and the verifier owns the shape check. These tests pin the parser
// boundary: the body reader and the verifier answer with 400/413, never a schema 422.
describe('Apple App Store notification ingress route', () => {
  it('is an unauthenticated server-to-server route and rejects malformed evidence', async () => {
    await createRequest().post(ROUTE).send({ signed_payload: 'wrong-shape' }).expect(400)
  })

  it('rejects malformed and oversized bodies without a schema diagnostic', async () => {
    const request = createRequest()

    const malformed = await request
      .post(ROUTE)
      .set('Content-Type', 'application/json')
      .send('{"signedPayload":')
      .expect(400)
    const oversized = await request
      .post(ROUTE)
      .send({ signedPayload: 'x'.repeat(40 * 1024) })
      .expect(413)

    expect(JSON.stringify([malformed.body, oversized.body])).not.toMatch(/schema/i)
  })
})
