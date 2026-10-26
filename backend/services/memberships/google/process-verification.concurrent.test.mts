import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { countTestGooglePlayProviderObservations } from '@voucha/test-helpers/google-play-memberships'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import { getMembershipByUserId } from '../index.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from './types.mts'

describe('concurrent Google Play verification', () => {
  it('commits one outcome when concurrent duplicate provider reads finish in different orders', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.duplicate-${randomUUID()}`
    const productId = `plus-${randomUUID()}`
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId },
      evidence: { purchase_token: `purchase-${randomUUID()}` },
    })
    const entered = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
    const replies = [
      Promise.withResolvers<GooglePlaySubscriptionV2>(),
      Promise.withResolvers<GooglePlaySubscriptionV2>(),
    ]
    let providerCalls = 0
    const client: GooglePlaySubscriptionsV2Client = {
      getSubscription: () => {
        const index = providerCalls++
        const reply = replies[index]
        if (!reply) throw new Error('Duplicate terminal job invoked Google')
        entered[index]!.resolve()
        return reply.promise
      },
      acknowledgeSubscription: async () => {
        throw new Error('Acknowledged purchase must not mutate Google')
      },
    }
    const subscription: GooglePlaySubscriptionV2 = {
      latestOrderId: `order-${randomUUID()}`,
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      testPurchase: {},
      externalAccountIdentifiers: {
        obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
      },
      lineItems: [{ productId, expiryTime: new Date(Date.now() + 86_400_000).toISOString() }],
    }
    const first = processGooglePlayMembershipVerification(verification.id, { client })
    await entered[0]!.promise
    const second = processGooglePlayMembershipVerification(verification.id, { client })
    await entered[1]!.promise
    replies[0]!.resolve(subscription)
    await first
    const membership = await getMembershipByUserId(user.id)
    replies[1]!.resolve(subscription)
    await second
    await processGooglePlayMembershipVerification(verification.id, { client })
    expect(providerCalls).toBe(2)
    await expect(countTestGooglePlayProviderObservations(verification.id)).resolves.toBe(1)
    await expect(getMembershipByUserId(user.id)).resolves.toEqual(membership)
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'verified',
    })
  })
})
