import { describe, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'

describe('Apple App Store notification ingress route', () => {
  it('is an unauthenticated server-to-server route and rejects malformed evidence', async () => {
    const request = createRequest()

    await request
      .post('/api/v1/memberships/apple-app-store/notifications')
      .send({ signed_payload: 'wrong-shape' })
      .expect(400)
  })
})
