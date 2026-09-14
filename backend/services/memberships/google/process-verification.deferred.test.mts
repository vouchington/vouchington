import { createHash, randomUUID } from 'node:crypto'
import { createMembershipVerification, getMembershipByUserId } from '@services/memberships'
import {
  createTestLaunchedNativeMembershipPurchaseIntent,
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { makeTestGooglePlayVerificationDue } from '@voucha/test-helpers/google-play-verification-state'
import { describe, expect, it } from 'vitest'
import { getMembershipVerification } from '../verifications.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play deferred replacement transition', () => {
  it('keeps an intent-pinned target pending until its line item becomes effective', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.deferred-${randomUUID()}`
    const currentProductId = `pro.monthly.${randomUUID()}`
    const targetProductId = `plus.monthly.${randomUUID()}`
    const purchaseToken = `google-token-${randomUUID()}`
    const sku = await createTestSku({ plan: 'plus' })
    const target = await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: targetProductId,
      basePlanId: 'target-plan',
    })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: targetProductId,
      basePlanId: 'other-plan',
    })
    const purchaseIntentId = await createTestLaunchedNativeMembershipPurchaseIntent({
      userId: user.id,
      membershipProviderProductId: target.id,
    })
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: purchaseToken },
    })
    let effective = false
    const client: GooglePlaySubscriptionsV2Client = {
      getSubscription: async (): Promise<GooglePlaySubscriptionV2> => ({
        latestOrderId: 'synthetic-order',
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        testPurchase: {},
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
        },
        lineItems: effective
          ? [
              {
                productId: targetProductId,
                offerDetails: { basePlanId: 'target-plan' },
                expiryTime: new Date(Date.now() + 30 * 86_400_000).toISOString(),
              },
            ]
          : [
              {
                productId: currentProductId,
                expiryTime: new Date(Date.now() + 30 * 86_400_000).toISOString(),
                deferredItemReplacement: { productId: targetProductId },
              },
              { productId: targetProductId },
            ],
      }),
      acknowledgeSubscription: async () => undefined,
    }
    await processGooglePlayMembershipVerification(verification.id, { client })
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'pending',
    })
    await expect(getMembershipByUserId(user.id)).resolves.toBeNull()

    effective = true
    await makeTestGooglePlayVerificationDue(verification.id)
    await processGooglePlayMembershipVerification(verification.id, { client })
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'verified',
    })
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ status: 'active' })
  })
})
