import { revokeTestOAuthFamilyWithoutDescendants } from '@voucha/test-helpers/oauth-authority-snapshots'
import { getTestOAuthTokenRevocationState } from '@voucha/test-helpers/entities/oauth-authorization-server'
import { describe, expect, it } from 'vitest'
import {
  assignTestOAuthClientOwner,
  startPausedTestOAuthClientUpdate,
} from '@voucha/test-helpers/entities/oauth-client-management'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { startPausedTestUserSoftDeletion } from '@voucha/test-helpers/entities/user-deletion'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { exchangeOAuthAuthorizationCode } from './index.mts'
import { validateOAuthAccessToken } from './access-tokens.mts'

describe('OAuth authority during participant lifecycle changes', () => {
  it.each(['subject', 'owner'] as const)(
    'does not fence the %s lifecycle and denies the issued bearer after deletion commits',
    async participant => {
      const user = await createTestUserDirect()
      const owner = await createTestUserDirect()
      const flow = await createTestApprovedOAuthAuthorization(user)
      await assignTestOAuthClientOwner(flow.client.client_id, owner.id)
      const deletion = await startPausedTestUserSoftDeletion(
        participant === 'subject' ? user.id : owner.id,
      )
      try {
        const tokens = await exchangeOAuthAuthorizationCode({
          clientId: flow.client.client_id,
          code: flow.code,
          codeVerifier: flow.verifier,
          redirectUri: flow.redirectUri,
        })
        deletion.release()
        await deletion.completed
        await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
      } finally {
        deletion.release()
        await deletion.completed
      }
    },
  )

  it('does not lock the app lifecycle while exchanging an independently written code', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    const update = await startPausedTestOAuthClientUpdate(flow.client.client_id)
    try {
      const tokens = await exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      })
      expect(tokens.access_token).toEqual(expect.any(String))
    } finally {
      update.release()
      await update.completed
    }
  })

  it('denies a live child token after its family is revoked even before child revocation catches up', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    await revokeTestOAuthFamilyWithoutDescendants(tokens.refresh_token!)
    await expect(
      getTestOAuthTokenRevocationState({ accessToken: tokens.access_token }),
    ).resolves.toMatchObject({ accessTokenRevoked: false })
    await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
  })
})
