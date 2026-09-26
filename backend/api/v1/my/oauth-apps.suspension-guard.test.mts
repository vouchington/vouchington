import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { createOwnedOAuthApp, listOwnedOAuthApps } from '@services/oauth-authorization-server'
import { randomTestOAuthRedirectUri } from '@services/oauth-authorization-server/test-support'

describe('OAuth app suspension guards', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it.each([
    ['POST', 'register'],
    ['PATCH', 'update'],
    ['DELETE', 'revoke'],
    ['POST', 'rotate'],
  ] as const)('rejects a suspended %s %s without changing the app', async (_method, action) => {
    const user = await createTestUser()
    const { oauth_app: app } = await createOwnedOAuthApp(user.id, {
      client_name: `Suspended app ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
      token_endpoint_auth_method: 'client_secret_basic',
      scopes: ['mcp.user:read'],
    })
    await suspendTestUser(user.id)
    suspendedUserIds.push(user.id)
    const request = createRequest()
    await request.authenticateAs(user)

    const response =
      action === 'register'
        ? await request.post('/api/v1/my/oauth-apps').send({
            client_name: 'Blocked',
            redirect_uris: [randomTestOAuthRedirectUri()],
            scopes: ['mcp.user:read'],
          })
        : action === 'update'
          ? await request.patch(`/api/v1/my/oauth-apps/${app.id}`).send({ client_name: 'Blocked' })
          : action === 'revoke'
            ? await request.delete(`/api/v1/my/oauth-apps/${app.id}`)
            : await request.post(`/api/v1/my/oauth-apps/${app.id}/client-secrets`)

    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const owned = await listOwnedOAuthApps(user.id, { limit: 10 })
    expect(owned.results).toEqual([app])
  })
})
