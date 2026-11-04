import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import { createTestUser } from '@voucha/test-helpers'
import { connectTestOAuthAccount } from '@voucha/test-helpers/entities/oauth-accounts'
import { getTestOAuthAuthorization } from '@voucha/test-helpers/entities/oauth-authorizations'
import { completeOAuthAuthorization } from '../authorization-completion.mts'
import { createProviderReAuthChallenge } from '../provider-reauth-challenge.mts'
import {
  createOAuthAccount,
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '../../../test-helpers/services/oauth/authorization-completion.mts'

describe('OAuth authorization broker reauthentication completion', () => {
  it('returns the connected account for a broker reauthentication', async () => {
    const cleanup = registerCleanup()
    const user = await createTestUser()
    cleanup.userIds.push(user.id)
    const actor = await createTestAccountChangeActor(user.id)
    const deviceId = actor.session.did
    const sessionId = actor.session.sid
    const completionToken = randomBytes(32).toString('base64url')
    const account = await createOAuthAccount('google', cleanup)
    await connectTestOAuthAccount('google', user.id, account.provider_user_id)
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'google',
        deviceId,
        sessionId,
        completionToken,
        purpose: 're_auth',
        callbackMode: 'web',
        initiatingUserId: user.id,
      },
      cleanup,
    )
    await createProviderReAuthChallenge({
      provider: 'google',
      userId: user.id,
      flowId,
      deviceId,
      sessionId,
    })

    await expect(
      completeOAuthAuthorization({
        flowId,
        completionToken,
        completionTokenSource: 'cookie',
        currentUserId: user.id,
        deviceId,
        sessionId,
      }),
    ).resolves.toMatchObject({
      status: 'connected',
      account: { provider_user_id: account.provider_user_id, user_id: user.id },
      name: 'Broker Completion',
    })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'completed',
      result_kind: 'connected',
      result_user_id: user.id,
    })
  })
})
