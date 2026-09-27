import { describe, expect, it } from 'vitest'
import {
  assignTestOAuthClientOwner,
  startPausedTestOAuthClientUpdate,
} from '@voucha/test-helpers/entities/oauth-client-management'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { startPausedTestUserSoftDeletion } from '@voucha/test-helpers/entities/user-deletion'
import {
  getTestPostgresAdvisoryLockHolderProcessId,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers/postgres-lock-wait'
import { createTestApprovedOAuthAuthorization } from './test-support.mts'
import { exchangeOAuthAuthorizationCode, validateOAuthAccessToken } from './index.mts'

describe('OAuth authority and account-deletion lock races', () => {
  it('rechecks a grant subject after waiting for its deletion fence', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    const deletion = await startPausedTestUserSoftDeletion(user.id)
    const exchangeOutcome = exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    }).then(
      () => ({ success: true }),
      (error: unknown) => ({ success: false, error }),
    )
    try {
      await waitForTestPostgresLockWaiter(
        deletion.holderProcessId,
        '/* lockOAuthParticipantUsers */',
      )
      deletion.release()
      await deletion.completed
      await expect(exchangeOutcome).resolves.toMatchObject({
        success: false,
        error: { code: 'invalid_grant' },
      })
    } finally {
      deletion.release()
      await deletion.completed
      await exchangeOutcome
    }
  })

  it('rechecks an app owner after waiting for its deletion fence', async () => {
    const user = await createTestUserDirect()
    const owner = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    await assignTestOAuthClientOwner(flow.client.client_id, owner.id)
    const deletion = await startPausedTestUserSoftDeletion(owner.id)
    const exchangeOutcome = exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    }).then(
      () => ({ success: true }),
      (error: unknown) => ({ success: false, error }),
    )
    try {
      await waitForTestPostgresLockWaiter(
        deletion.holderProcessId,
        '/* lockOAuthParticipantUsers */',
      )
      deletion.release()
      await deletion.completed
      await expect(exchangeOutcome).resolves.toMatchObject({
        success: false,
        error: { code: 'invalid_client' },
      })
    } finally {
      deletion.release()
      await deletion.completed
      await exchangeOutcome
    }
  })

  it('leaves an OAuth-issued credential unusable when deletion waits behind OAuth', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    const clientUpdate = await startPausedTestOAuthClientUpdate(flow.client.client_id)
    const exchange = exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    let deletion: ReturnType<typeof startPausedTestUserSoftDeletion> | undefined
    let pausedDeletion: Awaited<ReturnType<typeof startPausedTestUserSoftDeletion>> | undefined
    try {
      await waitForTestPostgresLockWaiter(
        clientUpdate.holderProcessId,
        '/* authenticateLockedOAuthClient */',
      )
      const oauthProcessId = await getTestPostgresAdvisoryLockHolderProcessId({ key: user.id })
      deletion = startPausedTestUserSoftDeletion(user.id)
      await waitForTestPostgresLockWaiter(
        oauthProcessId,
        '/* startPausedTestUserSoftDeletion:lock */',
      )
      clientUpdate.release()
      const tokens = await exchange
      await clientUpdate.completed
      pausedDeletion = await deletion
      pausedDeletion.release()
      await pausedDeletion.completed
      await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
    } finally {
      clientUpdate.release()
      try {
        await clientUpdate.completed
      } finally {
        pausedDeletion ??= deletion ? await deletion : undefined
        pausedDeletion?.release()
        await pausedDeletion?.completed
      }
    }
  })
})
