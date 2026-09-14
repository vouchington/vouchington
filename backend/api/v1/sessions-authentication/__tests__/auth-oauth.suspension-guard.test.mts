import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  suspendTestUser,
  unsuspendTestUser,
  safeUsername,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

describe('suspension guard on OAuth routes', () => {
  it('suspended user gets 403 on PUT /api/v1/auth/oauth/:provider/connect', async () => {
    const user = await createTestUser({ username: safeUsername('susp-oauth-connect') })
    await suspendTestUser(user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .put('/api/v1/auth/oauth/google/connect')
      .send({ code: 'fake-code', redirect_uri: 'https://example.com' })
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

    await unsuspendTestUser(user.id)
  })

  it('suspended user gets 403 on DELETE /api/v1/auth/oauth/:provider/connect', async () => {
    const user = await createTestUser({ username: safeUsername('susp-oauth-disconnect') })
    await suspendTestUser(user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.delete('/api/v1/auth/oauth/google/connect').expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

    await unsuspendTestUser(user.id)
  })
})
