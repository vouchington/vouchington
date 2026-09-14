import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { processGooglePlayMembershipVerification } from './process-verification.mts'

describe('Google Play verification preflight', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rejects a wrong-account current response before traversing a 100-hop linked chain', async () => {
    const owner = await createTestUser()
    const submitter = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const productId = `plus.monthly.${randomUUID()}`
    const currentToken = `google-current-${randomUUID()}`
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    const verification = await createMembershipVerification({
      userId: submitter.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: currentToken },
    })
    const calls: string[] = []
    await processGooglePlayMembershipVerification(verification.id, {
      client: {
        getSubscription: async ({ purchaseToken }) => {
          calls.push(purchaseToken)
          if (purchaseToken !== currentToken) throw new Error('Linked token must not be fetched')
          return {
            latestOrderId: 'synthetic-order',
            linkedPurchaseToken: `predecessor-${randomUUID()}`,
            subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
            acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
            testPurchase: {},
            externalAccountIdentifiers: {
              obfuscatedExternalAccountId: createHash('sha256').update(owner.id).digest('hex'),
            },
            lineItems: [
              { productId, expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString() },
            ],
          }
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    expect(calls).toEqual([currentToken])
    await expect(getMembershipVerification(submitter.id, verification.id)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'wrong_account',
    })
  })
})
