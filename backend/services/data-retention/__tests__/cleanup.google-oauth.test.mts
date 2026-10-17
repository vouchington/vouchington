import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestRetentionWindow,
  createTestUserDirect,
  getTestOAuthAccountRaw,
  getTestOAuthAuthorization,
  insertTestOAuthAccount,
  oauthAccountExistsByProviderUserId,
  setOAuthAccountCreatedAt,
} from '@voucha/test-helpers'
import { completeOAuthAuthorizationTransaction } from '@services/oauth/authorization-completion-transaction'
import {
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '../../../test-helpers/services/oauth/authorization-completion.mts'
import { deleteOrphanedOAuthAccountBatch } from '../cleanup-batches.mts'

describe('Google broker account retention', () => {
  it('retains the active old orphan and completes its native Google connection', async () => {
    const cleanup = registerCleanup()
    const window = createTestRetentionWindow()
    const activeProviderId = `retained-google-${createRandomString(12)}`
    const unrelatedProviderId = `unrelated-google-${createRandomString(12)}`
    cleanup.googleUserIds.push(activeProviderId, unrelatedProviderId)
    await insertTestOAuthAccount('google', activeProviderId)
    await insertTestOAuthAccount('google', unrelatedProviderId)
    const activeAccountId = await setOAuthAccountCreatedAt(
      'google',
      activeProviderId,
      window.firstEligibleDate,
    )
    await setOAuthAccountCreatedAt('google', unrelatedProviderId, window.secondEligibleDate)
    const user = await createTestUserDirect()
    cleanup.userIds.push(user.id)
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const completionToken = randomBytes(32).toString('base64url')
    const proofVerifier = randomBytes(32).toString('base64url')
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: activeProviderId,
        provider: 'google',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'connect',
        callbackMode: 'native',
        initiatingUserId: user.id,
        proofChallenge: createHash('sha256').update(proofVerifier).digest('base64url'),
      },
      cleanup,
    )

    await expect(
      deleteOrphanedOAuthAccountBatch(
        'google_accounts',
        'google_user_id',
        window.upperBoundDate,
        2,
        window.lowerBoundDate,
      ),
    ).resolves.toBe(1)
    await expect(oauthAccountExistsByProviderUserId('google', unrelatedProviderId)).resolves.toBe(
      false,
    )
    await expect(oauthAccountExistsByProviderUserId('google', activeProviderId)).resolves.toBe(true)
    await expect(getTestOAuthAuthorization(flowId)).resolves.toMatchObject({
      status: 'completion_ready',
      google_account_id: activeAccountId,
    })

    await expect(
      completeOAuthAuthorizationTransaction({
        flowId,
        completionToken,
        completionTokenSource: 'body',
        completionProofVerifier: proofVerifier,
        currentUserId: user.id,
        deviceId,
        sessionId,
      }),
    ).resolves.toMatchObject({
      kind: 'connected',
      provider: 'google',
      userId: user.id,
      newlyCompleted: true,
    })
    await expect(getTestOAuthAccountRaw('google', activeProviderId)).resolves.toMatchObject({
      user_id: user.id,
    })
    await expect(getTestOAuthAuthorization(flowId)).resolves.toMatchObject({
      status: 'completed',
      result_kind: 'connected',
      result_user_id: user.id,
      google_account_id: activeAccountId,
    })
  })
})
