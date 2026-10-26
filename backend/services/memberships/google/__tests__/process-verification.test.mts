import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { getTestGooglePlayVerificationRetryState } from '@voucha/test-helpers/google-play-memberships-persistence'
import {
  createMembershipVerification,
  getMembershipByUserId,
  getMembershipVerification,
} from '@services/memberships'
import { GooglePlaySubscriptionLookupError } from '../configured-client.mts'
import { processGooglePlayMembershipVerification } from '../process-verification.mts'
import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from '../types.mts'

describe('processGooglePlayMembershipVerification terminalization failure', () => {
  it('defers a permanent provider lookup loss when closing the known source fails', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.retry-${randomUUID()}`
    const purchaseToken = `purchase-${randomUUID()}`
    const productId = `plus.monthly.${randomUUID()}`
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    const submit = () =>
      createMembershipVerification({
        userId: user.id,
        provider: 'google_play',
        purchaseIntentId: null,
        idempotencyKey: randomUUID(),
        trustedProviderContext: { environment: 'test', applicationId },
        evidence: { purchase_token: purchaseToken },
      })
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
    let lookupCount = 0
    const client: GooglePlaySubscriptionsV2Client = {
      async getSubscription() {
        lookupCount += 1
        if (lookupCount === 1) return subscription
        throw new GooglePlaySubscriptionLookupError(404, purchaseToken)
      },
      async acknowledgeSubscription() {},
    }
    const seed = await submit()
    await processGooglePlayMembershipVerification(seed.id, { client })
    const membership = await getMembershipByUserId(user.id)
    expect(membership).toMatchObject({ status: 'active' })
    const verification = await submit()

    const { error } = await withPostgresQueryFailureForTest(
      '/* findKnownGooglePlayCurrentSource */',
      () => processGooglePlayMembershipVerification(verification.id, { client }),
      { command: 'SELECT' },
    )

    expect(error).toMatchObject({ code: '25P02' })
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'pending',
      reason_code: null,
    })
    const retry = await getTestGooglePlayVerificationRetryState(verification.id)
    expect(retry).toMatchObject({
      lease_token: null,
      leased_at: null,
      last_error: error.message,
    })
    expect(retry?.available_at?.getTime()).toBeGreaterThan(Date.now())
    await expect(getMembershipByUserId(user.id)).resolves.toEqual(membership)
  })
})
