import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import {
  createTestUser,
  getTestOAuthAccountRaw,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { getTestOAuthAuthorization } from '@voucha/test-helpers/entities/oauth-authorizations'
import { connectOAuthAccountToUser } from '@services/oauth-accounts'
import { completeOAuthAuthorization } from '../authorization-completion.mts'
import { completeOAuthAuthorizationTransaction } from '../authorization-completion-transaction.mts'
import {
  createOAuthAccount,
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '../../../test-helpers/services/oauth/authorization-completion.mts'

describe('suspended OAuth authorization completion', () => {
  it('rejects a suspended connect before persisting completion or linking the account', async () => {
    const cleanup = registerCleanup()
    const user = await createTestUser()
    cleanup.userIds.push(user.id)
    const account = await createOAuthAccount('github', cleanup)
    const actor = await createTestAccountChangeActor(user.id)
    const deviceId = actor.session.did
    const sessionId = actor.session.sid
    const completionToken = randomBytes(32).toString('base64url')
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'github',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'connect',
        callbackMode: 'web',
        initiatingUserId: user.id,
      },
      cleanup,
    )

    await suspendTestUser(user.id)
    try {
      await expect(
        completeOAuthAuthorizationTransaction({
          flowId,
          completionToken,
          completionTokenSource: 'cookie',
          currentUserId: user.id,
          deviceId,
          sessionId,
        }),
      ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' })
      expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
        status: 'completion_ready',
      })
      expect(await getTestOAuthAccountRaw('github', account.provider_user_id)).toMatchObject({
        user_id: null,
      })
    } finally {
      await unsuspendTestUser(user.id)
    }
  })

  it('authenticates and replays OAuth login for a suspended linked user', async () => {
    const cleanup = registerCleanup()
    const user = await createTestUser()
    cleanup.userIds.push(user.id)
    const account = await createOAuthAccount('github', cleanup)
    await connectOAuthAccountToUser('github', user.id, account.provider_user_id)
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const completionToken = randomBytes(32).toString('base64url')
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'github',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'authenticate',
        callbackMode: 'web',
      },
      cleanup,
    )

    await suspendTestUser(user.id)
    try {
      await expect(
        completeOAuthAuthorizationTransaction({
          flowId,
          completionToken,
          completionTokenSource: 'cookie',
          deviceId,
          sessionId,
        }),
      ).resolves.toMatchObject({ kind: 'authenticated', userId: user.id })

      const first = await completeOAuthAuthorization({
        flowId,
        completionToken,
        completionTokenSource: 'cookie',
        deviceId,
        sessionId,
      })
      expect(first).toMatchObject({
        status: 'authenticated',
        user: { id: user.id, suspended_at: expect.any(Date) },
      })
      if (first.status !== 'authenticated') throw new Error('Expected authenticated result')
      const replay = await completeOAuthAuthorization({
        flowId,
        completionToken,
        completionTokenSource: 'cookie',
        deviceId: first.deviceToken.payload.did,
        sessionId: first.sessionToken.payload.sid,
        currentUserId: user.id,
      })
      expect(replay).toMatchObject({ status: 'authenticated', user: { id: user.id } })
      if (replay.status !== 'authenticated') throw new Error('Expected authenticated replay')
      expect(replay.deviceToken.token).toBe(first.deviceToken.token)
      expect(replay.sessionToken.payload.sid).toBe(first.sessionToken.payload.sid)
      expect(replay.sessionToken.payload.mfa_at).toBe(first.sessionToken.payload.mfa_at)
    } finally {
      await unsuspendTestUser(user.id)
    }
  })
})
