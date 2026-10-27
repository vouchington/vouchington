import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, getActiveTestUserSessions } from '@voucha/test-helpers'
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import { connectTestOAuthAccount } from '@voucha/test-helpers/entities/oauth-accounts'
import { getTestOAuthAuthorization } from '@voucha/test-helpers/entities/oauth-authorizations'
import {
  createOAuthAccount,
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '@voucha/test-helpers/services/oauth/authorization-completion'
import { completionDependencies } from '@voucha/test-helpers/oauth-completion-fixtures'
import { completeOAuthAuthorization } from '../authorization-completion.mts'
import { completeOAuthAuthorizationTransaction } from '../authorization-completion-transaction.mts'

// Real receipt persistence and actor admission remain required even when the link already exists.
describe('already-linked OAuth connection completion', () => {
  it('completes and replays without revoking other sessions or announcing an account change', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const other = await createTestAccountChangeActor(user.id)
    const cleanup = registerCleanup()
    const account = await createOAuthAccount('github', cleanup)
    await connectTestOAuthAccount('github', user.id, account.provider_user_id)
    const completionToken = randomBytes(32).toString('base64url')
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'github',
        deviceId: actor.session.did,
        sessionId: actor.session.sid,
        completionToken,
        purpose: 'connect',
        callbackMode: 'web',
        initiatingUserId: user.id,
      },
      cleanup,
    )
    const dependencies = completionDependencies({ kind: 'pending' })
    dependencies.completeTransaction = completeOAuthAuthorizationTransaction
    const options = {
      flowId,
      completionToken,
      completionTokenSource: 'cookie' as const,
      currentUserId: user.id,
      deviceId: actor.session.did,
      sessionId: actor.session.sid,
    }
    await expect(completeOAuthAuthorization(options, dependencies)).resolves.toMatchObject({
      status: 'connected',
    })
    await expect(completeOAuthAuthorization(options, dependencies)).resolves.toMatchObject({
      status: 'connected',
    })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'completed',
      result_kind: 'connected',
      result_user_id: user.id,
    })
    expect(
      (await getActiveTestUserSessions(user.id)).map(session => session.id).toSorted(),
    ).toEqual([actor.session.sid, other.session.sid].toSorted())
    expect(dependencies.notifyAccountSecurityChange).not.toHaveBeenCalled()
    expect(dependencies.runConnectionEffects).not.toHaveBeenCalled()
    expect(dependencies.enqueueFriendSync).not.toHaveBeenCalled()
  })
})
