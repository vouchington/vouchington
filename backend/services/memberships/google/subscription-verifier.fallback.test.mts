import { describe, expect, it } from 'vitest'
import { verifyGooglePlaySubscription } from './subscription-verifier.mts'

describe('Google Play subscription revision fallback', () => {
  it('uses a token digest rather than raw purchase evidence when latestOrderId is absent', () => {
    const purchaseToken = 'secret-purchase-token'
    const result = verifyGooglePlaySubscription({
      purchaseToken,
      applicationId: 'ai.voucha.android',
      environment: 'test',
      expectedProduct: {
        membershipProductId: 'membership-product',
        providerProductId: 'plus.monthly',
        expectedObfuscatedAccountId: 'account-hash',
      },
      subscription: {
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        testPurchase: {},
        externalAccountIdentifiers: { obfuscatedExternalAccountId: 'account-hash' },
        lineItems: [{ productId: 'plus.monthly', expiryTime: '2026-10-01T00:00:00Z' }],
      },
    })
    expect(result).toMatchObject({ accepted: true })
    if (!result.accepted) throw new Error('Expected accepted Google Play observation')
    expect(result.observation.providerRevision).not.toContain(purchaseToken)
    expect(result.observation.providerRevision).toMatch(/^token:[a-f0-9]{64}:/)
  })
})
