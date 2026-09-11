import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUserWithAge, CONTRIBUTING_USER_AGE_MS } from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

// remote_actor relations (inbound ActivityPub follows, Phase C) are written exclusively by the
// signature-verified inbox receiver (Phase C2), never by this generic public API. Without this
// gate, any authenticated user could fabricate an arbitrary "remote actor follows local user"
// relation. See the subject_type === 'remote_actor' rejection in entity-relations.mts.
describe('entity-relations remote_actor rejection', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  it('rejects POST /api/v1/entity-relations/remote_actor/:id/follow/user with 403', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post(`/api/v1/entity-relations/remote_actor/${crypto.randomUUID()}/follow/user`)
      .send({ objectId: user.id })
      .expect(403)

    expect(response.body.message).toBe('remote_actor relations cannot be created via this endpoint')
  })

  it('still requires authentication before the remote_actor gate is reached', async () => {
    const request = createRequest()
    await request
      .post(`/api/v1/entity-relations/remote_actor/${crypto.randomUUID()}/follow/user`)
      .send({ objectId: crypto.randomUUID() })
      .expect(401)
  })
})
