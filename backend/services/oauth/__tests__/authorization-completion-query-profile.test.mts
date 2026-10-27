import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import { createRequestQueryProfile } from '../../../test-helpers/query-profiles.mts'
import { createTestUser, getTestOAuthAccountRaw } from '@voucha/test-helpers'
import { completeOAuthAuthorizationTransaction } from '../authorization-completion-transaction.mts'
import {
  createOAuthAccount,
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '../../../test-helpers/services/oauth/authorization-completion.mts'

describe('OAuth connection completion query profile', () => {
  it('checks the active connection user once while retaining the transaction locks', async () => {
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
    const profile = createRequestQueryProfile()
    await expect(
      profile.run(() =>
        completeOAuthAuthorizationTransaction({
          flowId,
          completionToken,
          completionTokenSource: 'cookie',
          currentUserId: user.id,
          deviceId,
          sessionId,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'connected', userId: user.id, newlyCompleted: true })
    expect(await getTestOAuthAccountRaw('github', account.provider_user_id)).toMatchObject({
      user_id: user.id,
    })
    const repeatedAnnotations = profile.summarize().repeats.map(repeat => repeat.annotation)
    expect(repeatedAnnotations).not.toContain('lockOAuthAccountConnectionUser')
    expect(repeatedAnnotations).not.toContain('lockOAuthAccountConnectionUserRow')
    expect(repeatedAnnotations).not.toContain('assertOAuthAccountConnectionUserActive')
  })
})
