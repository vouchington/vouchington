import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'
import type { PrivateUser } from '@services/users/types'

// Covers the post-auth runtime request-contract validation added for issue #320. Split out of
// api-keys.test.mts, which is at the file's 300-line lint ceiling. See
// backend/services/runtime-request-validation for the shared registry these tests exercise.
describe('POST /api/v1/my/api-keys - request contract validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 422 for a non-object JSON body before running label/permission checks', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422)
  })

  it('returns 401 (not 422) for a malformed body when unauthenticated', async () => {
    const request = createRequest()
    const response = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })

  it('returns 401 (not 422) for a malformed body from a Bearer API-key holder', async () => {
    const { rawKey } = await createApiKey(user.id, 'rss', 'Bearer Probe Key', ['rss:read'])
    const request = createRequest()
    const response = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${rawKey}`)
      .send('null')
      .expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })
})
