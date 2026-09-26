import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import {
  createOwnedOAuthApp,
  listOwnedOAuthApps,
  verifyOAuthClient,
} from '@services/oauth-authorization-server'
import { randomTestOAuthRedirectUri } from '@services/oauth-authorization-server/test-support'

describe('OAuth client verification suspension guards', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it.each(['PUT', 'DELETE'] as const)(
    'rejects a suspended administrator %s without changing verification',
    async method => {
      const [admin, owner] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
      ])
      const { oauth_app: app } = await createOwnedOAuthApp(owner.id, {
        client_name: `Suspended review ${randomBytes(6).toString('hex')}`,
        redirect_uris: [randomTestOAuthRedirectUri()],
        scopes: ['mcp.user:read'],
      })
      if (method === 'DELETE') await verifyOAuthClient(admin.id, app.id, app.client_name)
      const [before] = (await listOwnedOAuthApps(owner.id, { limit: 1 })).results
      await suspendTestUser(admin.id)
      suspendedUserIds.push(admin.id)
      const request = createRequest()
      await request.authenticateAs(admin)

      const path = `/api/v1/admin/oauth-clients/${app.id}/verification`
      const response =
        method === 'PUT'
          ? await request.put(path).send({ client_name: app.client_name })
          : await request.delete(path)

      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      const [after] = (await listOwnedOAuthApps(owner.id, { limit: 1 })).results
      expect(after?.verified_at).toEqual(before?.verified_at)
      expect(after?.verified_at === null).toBe(method === 'PUT')
    },
  )
})
