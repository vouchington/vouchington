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
import { interceptPostgresTransactionsForTest } from '../../../test-helpers/injected-postgres-transactions.mts'
import { acknowledgeOAuthAuthorizationCompletion } from '../authorization-completion-acknowledgement.mts'

async function createCompletedAuthorization() {
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
  const options = {
    flowId,
    deviceId,
    sessionId,
    completionToken,
    completionTokenSource: 'cookie',
  } as const
  return { options, flowId, completedAt }
}

describe('OAuth completion acknowledgement', () => {
  it('keeps a completion credential when its authorization expires before acknowledgement', async () => {
    const { options, flowId, completedAt } = await createCompletedAuthorization()
    const before = await getTestOAuthAuthorization(flowId)
    expect(before?.completion_token_hash).toBeTypeOf('string')
    onTestFinished(
      runBeforePostgresStatementForTest('/* acknowledgeOAuthAuthorizationCompletion */', () =>
        expireTestOAuthAuthorization(flowId, completedAt),
      ),
    )

    await expect(acknowledgeOAuthAuthorizationCompletion(options)).rejects.toMatchObject({
      status: 410,
    })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'completed',
      completion_token_hash: before?.completion_token_hash,
    })
  })

  it('rejects the losing acknowledgement as invalid without repeating the read', async () => {
    const { options, flowId } = await createCompletedAuthorization()
    // The winner commits after the loser's read and before the loser's UPDATE.
    const reads: string[] = []
    let winnerCommitted = false
    onTestFinished(
      interceptPostgresTransactionsForTest(
        transaction =>
          new Proxy(transaction, {
            async apply(target, thisArgument, argumentsList: Parameters<typeof transaction>) {
              const [input] = argumentsList
              const text = typeof input === 'string' ? input : input.text
              if (text.includes('/* readOAuthAuthorizationCompletionAcknowledgement */'))
                reads.push(text)
              if (
                !winnerCommitted &&
                text.includes('/* acknowledgeOAuthAuthorizationCompletion */')
              ) {
                winnerCommitted = true
                await acknowledgeOAuthAuthorizationCompletion(options)
              }
              return Reflect.apply(target, thisArgument, argumentsList)
            },
          }),
      ),
    )

    await expect(acknowledgeOAuthAuthorizationCompletion(options)).rejects.toMatchObject({
      status: 401,
    })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({ completion_token_hash: null })
    // One read for the winner and one for the loser; the loser must not read again.
    expect(reads).toHaveLength(2)
  })
})
