import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { getTestOAuthExchangeAttempts } from '@voucha/test-helpers/entities/oauth-exchange-attempts'
import { encryptSecret } from '@modules/token-secrets'
import { getCallbackCodePurpose } from '../authorization-secrets.mts'
import { runTestOAuthExchangeContinuation } from '@voucha/test-helpers/oauth-exchange-continuation'
import { createOAuthActorCleanupReceipt } from '@voucha/test-helpers/oauth-exchange-actor-owner'
import { recoverTestRetainedOAuthClaim } from '@voucha/test-helpers/oauth-exchange-retained-claim'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('OAuth retained failed-job recovery authority', () => {
  it.each(['unarmed', 'armed', 'foreign-claim'] as const)(
    'joins the actual %s failed job to its exact stale claim before recovery',
    async marker => {
      const id = uuidv7()
      const claimId = randomUUID()
      const cleanupReceipt = createOAuthActorCleanupReceipt()
      onTestFinished(async () => {
        cleanupReceipt.assertSafeToDelete()
        await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [id] })
      })
      await insertTestOAuthAuthorization({
        id,
        provider: 'github',
        status: 'exchanging',
        exchangeClaimId: claimId,
        exchangeAttempts: 1,
        callbackCodeCiphertext: 'owned-unused-code',
        callbackReceivedAt: new Date(),
        updatedAt: new Date(Date.now() - 61_000),
      })
      const result = await recoverTestRetainedOAuthClaim(id, claimId, marker, cleanupReceipt)
      expect(result.firstAttempts).toBe(5)
      expect(result.nativeErrors).toHaveLength(5)
      for (const err of result.nativeErrors) expect(err).toMatchObject({ code: '55P03' })
      expect(result.firstNativeError).toMatchObject({ code: '55P03' })
      expect(result.firstState).toBe('failed')
      const unarmed = marker === 'unarmed'
      expect(result.recovered).toEqual(unarmed ? [id] : [])
      const expectedBefore = unarmed
        ? {
            status: 'exchanging',
            exchange_claim_id: claimId,
            callback_code_ciphertext: 'owned-unused-code',
          }
        : {
            status: 'rejected',
            exchange_claim_id: null,
            callback_error: 'provider_exchange_outcome_unknown',
            callback_code_ciphertext: null,
          }
      expect(result.before).toMatchObject(expectedBefore)
      expect(result.secondState).toBe(unarmed ? 'failed' : undefined)
      expect(result.data).toEqual(unarmed ? { authorizationId: id } : undefined)
      const expectedAfter = unarmed
        ? {
            status: 'callback_received',
            exchange_claim_id: null,
            callback_error: null,
            callback_code_ciphertext: 'owned-unused-code',
          }
        : expectedBefore
      expect(result.after).toMatchObject(expectedAfter)
      const attempts = await getTestOAuthExchangeAttempts(id)
      expect(attempts).toHaveLength(1)
      const failedAt = expect.any(Date)
      const expectedAttempt = unarmed
        ? {
            exchange_claim_id: claimId,
            failed_at: failedAt,
            abandoned_at: null,
          }
        : { exchange_claim_id: claimId }
      expect(attempts).toMatchObject([expectedAttempt])
    },
  )
  it('rechecks native claim authority after the actual armed Job.updateData before any provider call', async () => {
    const id = uuidv7()
    const cleanupReceipt = createOAuthActorCleanupReceipt()
    onTestFinished(async () => {
      cleanupReceipt.assertSafeToDelete()
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [id] })
    })
    await insertTestOAuthAuthorization({
      id,
      provider: 'facebook',
      status: 'callback_received',
      callbackReceivedAt: new Date(),
      callbackCodeCiphertext: encryptSecret(
        'owned-never-admitted-code',
        getCallbackCodePurpose(id),
      ),
    })
    const result = await runTestOAuthExchangeContinuation(id, 'admission-expiry', cleanupReceipt)
    expect(result.attempts).toHaveLength(2)
    expect(result.firstFailure).toMatchObject({
      message: expect.stringContaining('lost its current unexpired claim'),
    })
    expect(result.attempts[1]?.data).toMatchObject({
      authorizationId: id,
      exchangeClaimId: expect.any(String),
      exchangeProviderRequestArmed: true,
    })
    expect(result.decryptCalls).toBe(1)
    expect(result.providerCalls).toBe(0)
    expect(result.state).toBe('completed')
    expect(result.data).toEqual({ authorizationId: id })
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'expired',
      exchange_claim_id: null,
      callback_code_ciphertext: null,
    })
  })

  it('terminally settles the fifth native claim when initial ownership persistence fails', async () => {
    const id = uuidv7()
    const cleanupReceipt = createOAuthActorCleanupReceipt()
    onTestFinished(async () => {
      cleanupReceipt.assertSafeToDelete()
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [id] })
    })
    await insertTestOAuthAuthorization({
      id,
      provider: 'github',
      status: 'callback_received',
      callbackReceivedAt: new Date(),
      callbackCodeCiphertext: 'owned-unused-code',
      exchangeAttempts: 4,
    })
    const result = await runTestOAuthExchangeContinuation(id, 'ownership-write', cleanupReceipt)
    expect(result.attempts).toHaveLength(2)
    expect(result.firstFailure).toBe(result.injectedError)
    expect(result.decryptCalls).toBe(0)
    expect(result.providerCalls).toBe(0)
    expect(result.state).toBe('completed')
    expect(await getTestOAuthExchangeAttempts(id)).toHaveLength(5)
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'rejected',
      callback_error: 'provider_exchange_failed',
      exchange_claim_id: null,
      callback_code_ciphertext: null,
    })
  })
})
