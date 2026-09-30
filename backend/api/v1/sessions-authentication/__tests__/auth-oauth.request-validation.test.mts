import { beforeAll, describe, expect, it } from 'vitest'
import {
  connectTestOAuthAccount,
  createRandomString,
  createTestUser,
  insertTestOAuthAccount,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import type { PrivateUser } from '@services/users/types'
import '../index.mts'

// Covers the path-contract validation on DELETE /api/v1/auth/oauth/:provider/connect (issue #1515).
// The route is protected: requireAuth() runs before the schema check, so an anonymous caller that
// probes an invalid :provider segment gets a bare 401, not the "Invalid OAuth provider" diagnostic.
// The path schema only declares a string, so the provider allow-list stays the handler's own 400.
describe('DELETE /api/v1/auth/oauth/:provider/connect - request contract validation', () => {
  let user: PrivateUser
  const providerUserId = `test-google-${createRandomString(10)}`

  beforeAll(async () => {
    user = await createTestUser()
    await insertTestOAuthAccount('google', providerUserId, `${providerUserId}@test.com`)
    await connectTestOAuthAccount('google', user.id, providerUserId)
  }, 15_000)

  it('returns a bare 401 without a provider diagnostic for an anonymous invalid provider', async () => {
    const response = await createRequest()
      .delete('/api/v1/auth/oauth/not-a-provider/connect')
      .expect(401)

    expect(response.body.message).toBe('Unauthorized')
  })

  it('returns 400 for an unknown provider without disconnecting the connected account', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.delete('/api/v1/auth/oauth/not-a-provider/connect').expect(400)
    expect(response.body.message).toBe('Invalid OAuth provider: not-a-provider')

    // The connected google account survives the rejected call and is still disconnectable.
    await request.delete('/api/v1/auth/oauth/google/connect').expect(204)
  })
})
