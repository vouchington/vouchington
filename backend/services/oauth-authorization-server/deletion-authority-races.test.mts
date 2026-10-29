import { describe, expect, it } from 'vitest'
import {
  assignTestOAuthClientOwner,
  startPausedTestOAuthClientUpdate,
} from '@voucha/test-helpers/entities/oauth-client-management'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { startPausedTestUserSoftDeletion } from '@voucha/test-helpers/entities/user-deletion'
import { getTestPostgresAdvisoryLockHolderProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import {
  createTestPostgresMultiWait,
  type TestPostgresMultiWaitAction,
} from '@voucha/test-helpers/postgres-multi-client-lock-observer'
import { withTestOAuthOperationWaiting } from '@voucha/test-helpers/oauth-client-lock-race'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { exchangeOAuthAuthorizationCode } from './index.mts'
import { validateOAuthAccessToken } from './access-tokens.mts'

describe('OAuth authority and account-deletion lock races', () => {
  it('rechecks a grant subject after waiting for its deletion fence', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    const deletion = await startPausedTestUserSoftDeletion(user.id)
    const exchangeOutcome = await withTestOAuthOperationWaiting({
      holderProcessId: deletion.holderProcessId,
      lock: { kind: 'advisory', key: user.id.toLowerCase(), waiterMode: 'shared' },
      waiterQueryMarker: '/* lockOAuthParticipantUsers */',
      releaseHolder: async () => {
        deletion.release()
        await deletion.completed
      },
      start: () =>
        exchangeOAuthAuthorizationCode({
          clientId: flow.client.client_id,
          code: flow.code,
          codeVerifier: flow.verifier,
          redirectUri: flow.redirectUri,
        }).then(
          () => ({ success: true }),
          (err: unknown) => ({ success: false, error: err }),
        ),
    })
    expect(exchangeOutcome).toMatchObject({ success: false, error: { code: 'invalid_grant' } })
  })

  it('rechecks an app owner after waiting for its deletion fence', async () => {
    const user = await createTestUserDirect()
    const owner = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    await assignTestOAuthClientOwner(flow.client.client_id, owner.id)
    const deletion = await startPausedTestUserSoftDeletion(owner.id)
    const exchangeOutcome = await withTestOAuthOperationWaiting({
      holderProcessId: deletion.holderProcessId,
      lock: { kind: 'advisory', key: owner.id.toLowerCase(), waiterMode: 'shared' },
      waiterQueryMarker: '/* lockOAuthParticipantUsers */',
      releaseHolder: async () => {
        deletion.release()
        await deletion.completed
      },
      start: () =>
        exchangeOAuthAuthorizationCode({
          clientId: flow.client.client_id,
          code: flow.code,
          codeVerifier: flow.verifier,
          redirectUri: flow.redirectUri,
        }).then(
          () => ({ success: true }),
          (err: unknown) => ({ success: false, error: err }),
        ),
    })
    expect(exchangeOutcome).toMatchObject({ success: false, error: { code: 'invalid_client' } })
  })

  it('leaves an OAuth-issued credential unusable when deletion waits behind OAuth', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    const clientUpdate = await startPausedTestOAuthClientUpdate(flow.client.client_id)
    await using wait = await createTestPostgresMultiWait()
    const oauthWaiter = await wait.start(
      {
        holderProcessId: clientUpdate.holderProcessId,
        lock: { kind: 'transaction' },
        pool: 'write',
        queryMarker: '/* authenticateLockedOAuthClient */',
        releaseHolder: async () => {
          clientUpdate.release()
          await clientUpdate.completed
        },
      },
      () =>
        exchangeOAuthAuthorizationCode({
          clientId: flow.client.client_id,
          code: flow.code,
          codeVerifier: flow.verifier,
          redirectUri: flow.redirectUri,
        }),
    )
    let pausedDeletion: Awaited<ReturnType<typeof startPausedTestUserSoftDeletion>> | undefined
    let deletionWaiter:
      | TestPostgresMultiWaitAction<Awaited<ReturnType<typeof startPausedTestUserSoftDeletion>>>
      | undefined
    try {
      await oauthWaiter.waitForLock()
      const oauthProcessId = await getTestPostgresAdvisoryLockHolderProcessId({
        key: user.id,
        mode: 'shared',
      })
      deletionWaiter = await wait.start(
        {
          holderProcessId: oauthProcessId,
          lock: { kind: 'advisory', key: user.id, holderMode: 'shared', waiterMode: 'exclusive' },
          pool: 'write',
          queryMarker: '/* startPausedTestUserSoftDeletion:lock */',
          // The OAuth transaction releases this shared lock after the client row is freed.
          releaseHolder: async () => {
            clientUpdate.release()
            await clientUpdate.completed
          },
        },
        () => startPausedTestUserSoftDeletion(user.id),
      )
      await deletionWaiter.waitForLock()
      clientUpdate.release()
      const tokens = await oauthWaiter.operation
      await clientUpdate.completed
      pausedDeletion = await deletionWaiter.operation
      pausedDeletion.release()
      await pausedDeletion.completed
      await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
    } finally {
      clientUpdate.release()
      try {
        await clientUpdate.completed
      } finally {
        pausedDeletion ??= await deletionWaiter?.operation.catch(() => undefined)
        pausedDeletion?.release()
        await pausedDeletion?.completed
      }
    }
  })
})
