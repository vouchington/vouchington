import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getAndDeleteLoginAttempt, peekLoginAttempt } from '@services/mfa/login-attempt'
import { upsertUser } from '@services/users/create'
import { getTestOAuthAuthorization, insertTestTotpAuthenticator } from '@voucha/test-helpers'
import { completeOAuthAuthorizationTransaction } from '../authorization-completion-transaction.mts'
import {
  createOAuthAccount,
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '../test-helpers/authorization-completion.mts'

describe('OAuth authorization completion MFA', () => {
  it('creates a private MFA attempt only after native completion proof succeeds', async () => {
    const cleanup = registerCleanup()
    const account = await createOAuthAccount('github', cleanup)
    const user = await upsertUser({
      emailAddress: account.provider_user_email_address!,
      deviceId: randomUUID(),
      sessionId: randomUUID(),
    })
    cleanup.userIds.push(user.id)
    await insertTestTotpAuthenticator(user.id, `broker-completion-${randomUUID()}`)
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const completionToken = randomBytes(32).toString('base64url')
    const proofVerifier = randomBytes(32).toString('base64url')
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'github',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'authenticate',
        callbackMode: 'native',
        proofChallenge: createHash('sha256').update(proofVerifier).digest('base64url'),
      },
      cleanup,
    )

    await expect(
      completeOAuthAuthorizationTransaction({
        flowId,
        completionToken,
        completionTokenSource: 'body',
        deviceId,
        sessionId,
      }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(peekLoginAttempt(flowId)).resolves.toBeNull()

    const result = await completeOAuthAuthorizationTransaction({
      flowId,
      completionToken,
      completionTokenSource: 'body',
      completionProofVerifier: proofVerifier,
      deviceId,
      sessionId,
    })
    expect(result).toMatchObject({ kind: 'mfa_required', userId: user.id })
    if (result.kind !== 'mfa_required') throw new Error('Expected MFA result')
    expect(result.loginAttemptId).not.toBe(flowId)
    await expect(peekLoginAttempt(flowId)).resolves.toBeNull()
    await expect(peekLoginAttempt(result.loginAttemptId)).resolves.toMatchObject({
      userId: user.id,
    })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'completed',
      result_kind: 'mfa_required',
      result_user_id: user.id,
    })
    await expect(getAndDeleteLoginAttempt(result.loginAttemptId)).resolves.toMatchObject({
      userId: user.id,
    })
  })
})
