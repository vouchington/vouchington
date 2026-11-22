import { randomBytes } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createTestUser } from '@voucha/test-helpers'
import {
  expireTestOAuthAuthorization,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import {
  createOAuthAccount,
  registerCleanup,
} from '../../../test-helpers/services/oauth/authorization-completion.mts'
import { acknowledgeOAuthAuthorizationCompletion } from '../authorization-completion-acknowledgement.mts'

describe('OAuth completion acknowledgement', () => {
  it('keeps a completion credential when its authorization expires before acknowledgement', async () => {
    const cleanup = registerCleanup()
    const user = await createTestUser()
    cleanup.userIds.push(user.id)
    const account = await createOAuthAccount('github', cleanup)
    const completionToken = randomBytes(32).toString('base64url')
    const deviceId = uuidv7()
    const sessionId = uuidv7()
    const completedAt = new Date()
    const flowId = await insertTestOAuthAuthorization({
      provider: 'github',
      status: 'completed',
      callbackReceivedAt: completedAt,
      completionReadyAt: completedAt,
      completedAt,
      deviceId,
      sessionId,
      completionToken,
      providerUserId: account.provider_user_id,
      resultKind: 'authenticated',
      resultUserId: user.id,
    })
    cleanup.authorizationIds.push(flowId)

    const before = await getTestOAuthAuthorization(flowId)
    expect(before?.completion_token_hash).toBeTypeOf('string')
    onTestFinished(
      runBeforePostgresStatementForTest('/* acknowledgeOAuthAuthorizationCompletion */', () =>
        expireTestOAuthAuthorization(flowId, completedAt),
      ),
    )

    await expect(
      acknowledgeOAuthAuthorizationCompletion({
        flowId,
        deviceId,
        sessionId,
        completionToken,
        completionTokenSource: 'cookie',
      }),
    ).rejects.toMatchObject({ status: 410 })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'completed',
      completion_token_hash: before?.completion_token_hash,
    })
  })
})
