import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
  markTestOAuthAuthorizationExchanging,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { getTestOAuthExchangeAttempts } from '@voucha/test-helpers/entities/oauth-exchange-attempts'
import {
  completeTestOAuthAuthorizationWhileRecoverySkipsLockedRow,
  withTestOAuthAuthorizationRowLocked,
} from '@voucha/test-helpers/entities/oauth-authorization-recovery'
import {
  deleteTestOAuthAccount,
  insertTestOAuthAccount,
} from '@voucha/test-helpers/entities/oauth-accounts'
import {
  getRecoverableOAuthAuthorizationIds,
  processOAuthAuthorizationExchange,
} from '../authorization-exchange.mts'
import {
  claimOAuthAuthorizationExchange,
  rejectExhaustedOAuthAuthorizationExchange,
  releaseOAuthAuthorizationExchangeClaim,
} from '../authorization-exchange-state.mts'

describe('OAuth authorization exchange recovery', () => {
  it('releases a failed X decryption claim for an immediate retry inside the queue-start budget', async () => {
    const flowId = await insertCallbackReceivedAuthorization(0, { provider: 'x' })

    await expect(processOAuthAuthorizationExchange(flowId)).rejects.toThrow(
      'Invalid encrypted secret format',
    )

    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'callback_received',
      exchange_claim_id: null,
    })

    const retryClaim = await claimOAuthAuthorizationExchange(flowId)
    expect(retryClaim).toMatchObject({
      id: flowId,
      provider: 'x',
      exchange_claim_id: expect.any(String),
    })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'exchanging',
      exchange_claim_id: retryClaim?.exchange_claim_id,
    })
  })

  it('returns retryable rows and rejects exhausted rows without starving the scan', async () => {
    const retryableId = await insertCallbackReceivedAuthorization(4)
    const exhaustedId = await insertCallbackReceivedAuthorization(5)
    const unrelatedRetryableId = await insertCallbackReceivedAuthorization(4)
    const unrelatedExhaustedId = await insertCallbackReceivedAuthorization(5)

    const recoverable = await getRecoverableOAuthAuthorizationIds(500, [retryableId, exhaustedId])

    expect(recoverable.ids).toContain(retryableId)
    expect(recoverable.ids).not.toContain(exhaustedId)
    expect(recoverable.ids).not.toContain(unrelatedRetryableId)
    expect(recoverable.ids).not.toContain(unrelatedExhaustedId)
    expect(await getTestOAuthAuthorization(unrelatedRetryableId)).toMatchObject({
      status: 'callback_received',
    })
    expect(await getTestOAuthAuthorization(unrelatedExhaustedId)).toMatchObject({
      status: 'callback_received',
    })
    const exhausted = await getTestOAuthAuthorization(exhaustedId)
    expect({
      status: exhausted?.status,
      callback_error: exhausted?.callback_error,
      callback_code_ciphertext: exhausted?.callback_code_ciphertext,
    }).toEqual({
      status: 'rejected',
      callback_error: 'provider_exchange_failed',
      callback_code_ciphertext: null,
    })
  })

  it('rejects X codes that cannot start inside the provider lifetime budget', async () => {
    const expiredXId = await insertCallbackReceivedAuthorization(0, {
      provider: 'x',
      callbackAgeSeconds: 11,
    })

    const recoverable = await getRecoverableOAuthAuthorizationIds(500, [expiredXId])

    expect(recoverable.ids).not.toContain(expiredXId)
    const expired = await getTestOAuthAuthorization(expiredXId)
    expect({
      status: expired?.status,
      callback_error: expired?.callback_error,
    }).toEqual({
      status: 'rejected',
      callback_error: 'provider_code_expired',
    })
  })

  it('does not reject a stale claim that completes while recovery waits for its row lock', async () => {
    const githubUserId = `github-recovery-${randomUUID()}`
    const account = await insertTestOAuthAccount('github', githubUserId)
    const flowId = await insertTestOAuthAuthorization({
      provider: 'github',
      status: 'exchanging',
      callbackCodeCiphertext: 'test-code-ciphertext',
      callbackReceivedAt: new Date(),
      exchangeAttempts: 5,
      exchangeClaimId: randomUUID(),
      updatedAt: new Date(Date.now() - 120_000),
    })
    registerAuthorizationCleanup(flowId, githubUserId)

    // Historical title retained for review. The producer now skips busy rows; this is not EPQ proof.
    const recovery = await completeTestOAuthAuthorizationWhileRecoverySkipsLockedRow(
      flowId,
      githubUserId,
      () => getRecoverableOAuthAuthorizationIds(500, [flowId]),
    )
    expect(recovery).toEqual({
      whileLocked: { ids: [], hasMore: false },
      afterCompletion: { ids: [], hasMore: false },
    })

    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'completion_ready',
      callback_error: null,
      callback_code_ciphertext: null,
      exchange_claim_id: null,
      github_account_id: account.account_id,
    })
  })

  it('claims and releases a persisted callback for retry', async () => {
    const flowId = await insertCallbackReceivedAuthorization(0)

    const claimed = await claimOAuthAuthorizationExchange(flowId)

    expect(claimed).toMatchObject({
      id: flowId,
      provider: 'github',
      callback_code_ciphertext: 'test-code-ciphertext',
      exchange_claim_id: expect.any(String),
    })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'exchanging',
      exchange_claim_id: claimed?.exchange_claim_id,
    })

    await releaseOAuthAuthorizationExchangeClaim(flowId, claimed!.exchange_claim_id)
    const retried = await claimOAuthAuthorizationExchange(flowId)
    expect(retried!.exchange_claim_id).not.toBe(claimed!.exchange_claim_id)
    await releaseOAuthAuthorizationExchangeClaim(flowId, claimed!.exchange_claim_id)
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'exchanging',
      exchange_claim_id: retried!.exchange_claim_id,
    })
    await releaseOAuthAuthorizationExchangeClaim(flowId, retried!.exchange_claim_id)
    expect(await getTestOAuthExchangeAttempts(flowId)).toMatchObject([
      {
        attempt_number: 1,
        exchange_claim_id: claimed!.exchange_claim_id,
        failed_at: expect.any(Date),
      },
      {
        attempt_number: 2,
        exchange_claim_id: retried!.exchange_claim_id,
        failed_at: expect.any(Date),
      },
    ])

    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'callback_received',
      exchange_claim_id: null,
    })
  })

  it('durably rejects a claimed exchange after the attempt budget is exhausted', async () => {
    const flowId = await insertCallbackReceivedAuthorization(4)
    const claimId = randomUUID()
    await markTestOAuthAuthorizationExchanging(flowId, claimId)

    await expect(rejectExhaustedOAuthAuthorizationExchange(flowId, claimId)).resolves.toBe(true)
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'rejected',
      callback_error: 'provider_exchange_failed',
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
    await expect(rejectExhaustedOAuthAuthorizationExchange(flowId, claimId)).resolves.toBe(false)
  })

  it('returns no claim for unknown and expired authorizations', async () => {
    await expect(claimOAuthAuthorizationExchange(randomUUID())).resolves.toBeNull()

    const expiredId = await insertTestOAuthAuthorization({
      status: 'callback_received',
      callbackCodeCiphertext: 'test-code-ciphertext',
      callbackReceivedAt: new Date(),
      expiresAt: new Date(Date.now() - 1_000),
    })
    registerAuthorizationCleanup(expiredId)

    await expect(claimOAuthAuthorizationExchange(expiredId)).resolves.toBeNull()
    expect(await getTestOAuthAuthorization(expiredId)).toMatchObject({
      status: 'expired',
      callback_code_ciphertext: null,
    })
  })

  it('reports native claim contention as failure through the production processor without a null success', async () => {
    const flowId = await insertCallbackReceivedAuthorization(0)
    await withTestOAuthAuthorizationRowLocked(flowId, async () => {
      await expect(processOAuthAuthorizationExchange(flowId)).rejects.toMatchObject({
        code: '55P03',
      })
    })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({ exchange_claim_id: null })
    expect(await getTestOAuthExchangeAttempts(flowId)).toEqual([])
    const claimed = await claimOAuthAuthorizationExchange(flowId)
    expect(claimed?.id).toBe(flowId)
    if (!claimed) throw new Error('Expected an actual OAuth claim after releasing the holder')
    await releaseOAuthAuthorizationExchangeClaim(flowId, claimed.exchange_claim_id)
  })

  it('preserves exact claim and exhausted history when native release and rejection encounter contention', async () => {
    const claimId = randomUUID()
    const flowId = await insertTestOAuthAuthorization({
      provider: 'github',
      status: 'exchanging',
      callbackCodeCiphertext: 'test-code-ciphertext',
      callbackReceivedAt: new Date(),
      exchangeAttempts: 5,
      exchangeClaimId: claimId,
      updatedAt: new Date(Date.now() - 120_000),
    })
    registerAuthorizationCleanup(flowId)
    const before = await getTestOAuthExchangeAttempts(flowId)
    await withTestOAuthAuthorizationRowLocked(flowId, async () => {
      await expect(releaseOAuthAuthorizationExchangeClaim(flowId, claimId)).rejects.toMatchObject({
        code: '55P03',
      })
      await expect(
        rejectExhaustedOAuthAuthorizationExchange(flowId, claimId),
      ).rejects.toMatchObject({ code: '55P03' })
    })
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({ exchange_claim_id: claimId })
    expect(await getTestOAuthExchangeAttempts(flowId)).toEqual(before)
    await expect(rejectExhaustedOAuthAuthorizationExchange(flowId, claimId)).resolves.toBe(true)
  })
})

async function insertCallbackReceivedAuthorization(
  exchangeAttempts: number,
  options: { provider?: 'github' | 'x'; callbackAgeSeconds?: number } = {},
): Promise<string> {
  const flowId = await insertTestOAuthAuthorization({
    provider: options.provider ?? 'github',
    status: 'callback_received',
    callbackCodeCiphertext: 'test-code-ciphertext',
    completionToken: randomUUID(),
    completionTokenCiphertext: 'test-completion-ciphertext',
    callbackReceivedAt: new Date(Date.now() - (options.callbackAgeSeconds ?? 0) * 1000),
    exchangeAttempts,
  })
  registerAuthorizationCleanup(flowId)
  return flowId
}

function registerAuthorizationCleanup(authorizationId: string, githubUserId?: string): void {
  onTestFinished(async () => {
    await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [authorizationId] })
    if (githubUserId) await deleteTestOAuthAccount('github', githubUserId)
  })
}
