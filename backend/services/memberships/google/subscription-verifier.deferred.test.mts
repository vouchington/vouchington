import { describe, expect, it } from 'vitest'
import { verifyGooglePlaySubscription } from './subscription-verifier.mts'

describe('Google Play deferred replacement verification', () => {
  it('retains the deferred target without entitling it before its line item has an expiry', () => {
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          latestOrderId: 'GPA.deferred',
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
          testPurchase: {},
          externalAccountIdentifiers: { obfuscatedExternalAccountId: 'account-hash' },
          lineItems: [
            {
              productId: 'pro.monthly',
              expiryTime: '2026-10-01T00:00:00Z',
              deferredItemReplacement: { productId: 'plus.monthly' },
            },
            { productId: 'plus.monthly' },
          ],
        },
        purchaseToken: 'deferred-target',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: {
          membershipProductId: 'plus',
          providerProductId: 'plus.monthly',
          expectedObfuscatedAccountId: 'account-hash',
        },
      }),
    ).toEqual({ accepted: false, reasonCode: 'purchase_pending', bindablePending: true })
  })

  it('keeps the current entitled line item active while another product is deferred', () => {
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          latestOrderId: 'GPA.current',
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
          testPurchase: {},
          externalAccountIdentifiers: { obfuscatedExternalAccountId: 'account-hash' },
          lineItems: [
            {
              productId: 'pro.monthly',
              expiryTime: '2026-10-01T00:00:00Z',
              deferredItemReplacement: { productId: 'plus.monthly' },
            },
            { productId: 'plus.monthly' },
          ],
        },
        purchaseToken: 'current-entitlement',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: {
          membershipProductId: 'pro',
          providerProductId: 'pro.monthly',
          expectedObfuscatedAccountId: 'account-hash',
        },
      }),
    ).toMatchObject({
      accepted: true,
      observation: { providerProductId: 'pro.monthly', lifecycle: 'active' },
    })
  })
})
