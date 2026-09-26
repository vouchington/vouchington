import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  createOwnedOAuthApp,
  listOAuthClientsForVerification,
} from '@services/oauth-authorization-server'
import { randomTestOAuthRedirectUri } from '@services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const CLIENT_ID = '00000000-0000-7000-8000-000000000001'

// Plan #285: malformed input from an anonymous caller is a 401 with no diagnostic, and from an
// administrator a 422 that fires before the service changes anything.
describe('admin OAuth client verification request contract validation', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('returns 401 without a diagnostic for anonymous malformed input', async () => {
    const request = createRequest()
    for (const response of [
      await request.get('/api/v1/admin/oauth-clients?verification=pending'),
      await request
        .put(`/api/v1/admin/oauth-clients/${CLIENT_ID}/verification`)
        .set('Content-Type', 'application/json')
        .send('null'),
      await request.delete('/api/v1/admin/oauth-clients/not-a-uuid/verification'),
    ]) {
      expect(response.status).toBe(401)
      expect(response.text).not.toMatch(/invalid|verification must/i)
    }
  })

  it('returns 422 for an unknown filter', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/admin/oauth-clients?verification=pending').expect(422)
  })

  it.each([
    ['a non-object body', 'null'],
    ['a missing name', '{}'],
    ['a non-string name', '{"client_name":7}'],
    ['an unknown field', '{"client_name":"App","verified_by_id":"x"}'],
  ])('returns 422 for %s without verifying', async (_label, body) => {
    const owner = await createTestUser()
    const { oauth_app: app } = await createOwnedOAuthApp(owner.id, {
      client_name: `Contract review ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
      scopes: ['mcp.user:read'],
    })
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .put(`/api/v1/admin/oauth-clients/${app.id}/verification`)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(422)
    const verified = await listOAuthClientsForVerification({ verification: 'verified', limit: 100 })
    expect(verified.results.map(client => client.id)).not.toContain(app.id)
  })

  it('returns 422 for a malformed id', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .put('/api/v1/admin/oauth-clients/not-a-uuid/verification')
      .send({ client_name: 'App' })
      .expect(422)
    await request.delete('/api/v1/admin/oauth-clients/not-a-uuid/verification').expect(422)
  })
})
