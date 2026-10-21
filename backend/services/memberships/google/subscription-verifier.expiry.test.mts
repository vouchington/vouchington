import { describe, expect, it } from 'vitest'
import { verifyGooglePlaySubscription } from './subscription-verifier.mts'
import type { GooglePlaySubscriptionV2 } from './types.mts'

describe('Google Play subscription expiry boundary', () => {
  it.each([
    ['leap-year month boundary', '2024-03-01T00:00:00.000Z'],
    ['year and month boundary', '2025-01-01T00:00:00.000Z'],
  ])('expires an active purchase exactly at %s', (_name, instant) => {
    const expiry = new Date(instant)
    const subscription: GooglePlaySubscriptionV2 = {
      latestOrderId: 'GPA.expiry-boundary',
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      testPurchase: {},
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'account-hash' },
      lineItems: [{ productId: 'plus.monthly', expiryTime: instant }],
    }

    for (const [offsetMs, lifecycle, acknowledgementPending] of [
      [-1, 'active', true],
      [0, 'expired', false],
      [1, 'expired', false],
    ] as const) {
      const result = verifyGooglePlaySubscription({
        subscription,
        purchaseToken: 'expiry-boundary-token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: {
          membershipProductId: 'membership-product',
          providerProductId: 'plus.monthly',
          expectedObfuscatedAccountId: 'account-hash',
        },
        now: new Date(expiry.getTime() + offsetMs),
      })

      expect(result).toMatchObject({
        accepted: true,
        acknowledgementPending,
        observation: {
          lifecycle,
          expiresAt: expiry,
          terminalAt: offsetMs < 0 ? null : expiry,
        },
      })
    }
  })
})
