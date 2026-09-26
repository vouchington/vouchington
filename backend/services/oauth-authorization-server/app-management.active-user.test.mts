import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect, softDeleteUser } from '@voucha/test-helpers/entities/users'
import { randomTestOAuthRedirectUri } from './test-support.mts'
import {
  authenticateOAuthClient,
  createOwnedOAuthApp,
  listOwnedOAuthApps,
  revokeOwnedOAuthApp,
  rotateOwnedOAuthAppSecret,
  updateOwnedOAuthApp,
} from './index.mts'

const DELETED_OWNER = 'cannot own new data after deletion'

function confidentialAppInput() {
  return {
    client_name: `Fenced app ${randomBytes(6).toString('hex')}`,
    redirect_uris: [randomTestOAuthRedirectUri()],
    token_endpoint_auth_method: 'client_secret_basic',
    scopes: ['mcp.user:read'],
  }
}

describe('owned OAuth app management after the owner is deleted', () => {
  it('refuses to register a new app', async () => {
    const owner = await createTestUserDirect()
    await softDeleteUser(owner.id)

    await expect(createOwnedOAuthApp(owner.id, confidentialAppInput())).rejects.toThrow(
      DELETED_OWNER,
    )
  })

  it('refuses to rename, rotate or revoke an existing app, and leaves it unchanged', async () => {
    const owner = await createTestUserDirect()
    const { oauth_app: app, client_secret: secret } = await createOwnedOAuthApp(
      owner.id,
      confidentialAppInput(),
    )
    await softDeleteUser(owner.id)

    await expect(
      updateOwnedOAuthApp(owner.id, app.id, { client_name: 'Renamed after deletion' }),
    ).rejects.toThrow(DELETED_OWNER)
    await expect(rotateOwnedOAuthAppSecret(owner.id, app.id)).rejects.toThrow(DELETED_OWNER)
    await expect(revokeOwnedOAuthApp(owner.id, app.id)).rejects.toThrow(DELETED_OWNER)
    await expect(listOwnedOAuthApps(owner.id, { limit: 10 })).resolves.toMatchObject({
      results: [{ id: app.id, client_name: app.client_name }],
    })
    await expect(
      authenticateOAuthClient(app.client_id, secret ?? undefined),
    ).resolves.toBeUndefined()
  })
})
