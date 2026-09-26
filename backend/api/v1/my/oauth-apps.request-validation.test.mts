import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createOwnedOAuthApp, listOwnedOAuthApps } from '@services/oauth-authorization-server'
import { randomTestOAuthRedirectUri } from '@services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const APP_ID = '00000000-0000-7000-8000-000000000001'
const validCreate = {
  client_name: 'Contract app',
  redirect_uris: ['http://127.0.0.1:43123/callback'],
  scopes: ['mcp.user:read'],
}

// Plan #285: malformed input from an anonymous caller is a 401 with no diagnostic, and from an
// authenticated owner a 422 that fires before the service changes anything.
describe('OAuth app request contract validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it.each([
    ['POST', '/api/v1/my/oauth-apps', 'null'],
    ['PATCH', `/api/v1/my/oauth-apps/${APP_ID}`, '{"client_name":7}'],
  ] as const)(
    'returns 401 without a diagnostic for anonymous %s %s',
    async (method, path, body) => {
      const request = createRequest()
      const response = await (method === 'POST' ? request.post(path) : request.patch(path))
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(401)
      expect(response.text).not.toMatch(/invalid/i)
    },
  )

  it('returns 401 without a diagnostic for anonymous malformed ids', async () => {
    const request = createRequest()
    for (const response of [
      await request.delete('/api/v1/my/oauth-apps/not-a-uuid'),
      await request.post('/api/v1/my/oauth-apps/not-a-uuid/client-secrets'),
    ]) {
      expect(response.status).toBe(401)
      expect(response.text).not.toMatch(/invalid/i)
    }
  })

  it.each([
    ['a non-object body', 'null'],
    ['a missing scope list', JSON.stringify({ ...validCreate, scopes: undefined })],
    ['an unknown field', JSON.stringify({ ...validCreate, owner_user_id: APP_ID })],
    ['duplicate redirect URIs', JSON.stringify({ ...validCreate, redirect_uris: ['a', 'a'] })],
    [
      'too many redirect URIs',
      JSON.stringify({
        ...validCreate,
        redirect_uris: Array.from({ length: 11 }, (_, index) => `http://127.0.0.1:1/${index}`),
      }),
    ],
    ['an unknown auth method', JSON.stringify({ ...validCreate, token_endpoint_auth_method: 'x' })],
  ])('returns 422 for %s without registering an app', async (_label, body) => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/oauth-apps')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(422)
    const owned = await listOwnedOAuthApps(user.id, { limit: 1 })
    expect(owned.results).toEqual([])
  })

  it('returns 422 for a malformed update without changing the app', async () => {
    const owner = await createTestUser()
    const { oauth_app: app } = await createOwnedOAuthApp(owner.id, {
      ...validCreate,
      client_name: `Contract app ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .patch(`/api/v1/my/oauth-apps/${app.id}`)
      .send({ client_name: 'Renamed', redirect_uris: [] })
      .expect(422)
    await request.patch('/api/v1/my/oauth-apps/not-a-uuid').send({ client_name: 'x' }).expect(422)
    const owned = await listOwnedOAuthApps(owner.id, { limit: 1 })
    expect(owned.results).toEqual([app])
  })

  it('returns 422 for a malformed id before revoking or rotating', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete('/api/v1/my/oauth-apps/not-a-uuid').expect(422)
    await request.post('/api/v1/my/oauth-apps/not-a-uuid/client-secrets').expect(422)
  })
})
