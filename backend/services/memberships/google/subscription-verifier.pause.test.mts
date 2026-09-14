import { describe, expect, it } from 'vitest'
import { verifyGooglePlaySubscription } from './subscription-verifier.mts'

describe('Google Play paused subscription verification', () => {
  it('timestamps a hold at observed access loss despite a future expiry', () => {
    const now = new Date('2026-09-01T00:00:00Z')
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          latestOrderId: 'GPA.held',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
          subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD',
          testPurchase: {},
          externalAccountIdentifiers: { obfuscatedExternalAccountId: 'account-hash' },
          lineItems: [{ productId: 'plus.monthly', expiryTime: '2026-10-01T00:00:00.000Z' }],
        },
        purchaseToken: 'held-token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: {
          membershipProductId: 'membership-product',
          providerProductId: 'plus.monthly',
          expectedObfuscatedAccountId: 'account-hash',
        },
        now,
      }),
    ).toMatchObject({
      accepted: true,
      observation: {
        lifecycle: 'paused',
        expiresAt: new Date('2026-10-01T00:00:00Z'),
        terminalAt: now,
      },
    })
  })
})
