import { describe, expect, it } from 'vitest'
import { verifyGooglePlaySubscription } from './subscription-verifier.mts'

describe('Google Play subscriptionsv2 verification', () => {
  const expected = {
    membershipProductId: 'membership-product',
    providerProductId: 'plus.monthly',
    expectedObfuscatedAccountId: 'account-hash',
  }
  const base = {
    latestOrderId: 'GPA.1',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' as const,
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' as const,
    testPurchase: {},
    externalAccountIdentifiers: { obfuscatedExternalAccountId: 'account-hash' },
    lineItems: [
      {
        productId: 'plus.monthly',
        expiryTime: '2026-10-01T00:00:00.000Z',
        autoRenewingPlan: { autoRenewEnabled: true },
      },
    ],
  }
  it('only accepts an authoritative purchased subscription and preserves linked-token lineage', () => {
    expect(
      verifyGooglePlaySubscription({
        subscription: { ...base, linkedPurchaseToken: 'predecessor-token' },
        purchaseToken: 'current-token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
        now: new Date('2026-09-01T00:00:00Z'),
      }),
    ).toMatchObject({
      accepted: true,
      acknowledgementPending: true,
      observation: {
        providerLineageId: 'predecessor-token',
        providerEventId: 'current-token',
        lifecycle: 'active',
      },
    })
  })
  it('keeps pending purchases non-entitling and rejects mismatched products', () => {
    expect(
      verifyGooglePlaySubscription({
        subscription: { ...base, subscriptionState: 'SUBSCRIPTION_STATE_PENDING' },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toEqual({ accepted: false, reasonCode: 'purchase_pending', bindablePending: true })
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          ...base,
          lineItems: [{ productId: 'other', expiryTime: '2026-10-01T00:00:00.000Z' }],
        },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toEqual({ accepted: false, reasonCode: 'wrong_product' })
  })
  it('matches the purchased base plan and offer instead of only the subscription product', () => {
    const expectedAnnualOffer = {
      ...expected,
      basePlanId: 'annual',
      offerId: 'intro',
    }
    const subscription = {
      ...base,
      lineItems: [
        {
          productId: 'plus.monthly',
          expiryTime: '2026-10-01T00:00:00.000Z',
          offerDetails: { basePlanId: 'monthly' },
        },
        {
          productId: 'plus.monthly',
          expiryTime: '2027-10-01T00:00:00.000Z',
          offerDetails: { basePlanId: 'annual', offerId: 'intro' },
        },
      ],
    }
    expect(
      verifyGooglePlaySubscription({
        subscription,
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expectedAnnualOffer,
      }),
    ).toMatchObject({
      accepted: true,
      observation: { expiresAt: new Date('2027-10-01T00:00:00Z') },
    })
    expect(
      verifyGooglePlaySubscription({
        subscription,
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: { ...expected, basePlanId: 'annual', offerId: null },
      }),
    ).toEqual({ accepted: false, reasonCode: 'wrong_product' })
  })

  it('uses the authoritative subscription start time', () => {
    expect(
      verifyGooglePlaySubscription({
        subscription: { ...base, startTime: '2026-08-01T00:00:00Z' },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toMatchObject({
      accepted: true,
      observation: { effectiveAt: new Date('2026-08-01T00:00:00Z') },
    })
  })
  it('rejects a malformed or after-expiry authoritative start time', () => {
    for (const startTime of ['invalid', '2026-11-01T00:00:00Z'])
      expect(
        verifyGooglePlaySubscription({
          subscription: { ...base, startTime },
          purchaseToken: 'token',
          applicationId: 'ai.voucha.android',
          environment: 'test',
          expectedProduct: expected,
        }),
      ).toEqual({ accepted: false, reasonCode: 'invalid_evidence' })
  })
  it('rejects unspecified and canceled pending states and does not acknowledge non-active states', () => {
    for (const subscriptionState of [
      'SUBSCRIPTION_STATE_UNSPECIFIED',
      'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
    ] as const)
      expect(
        verifyGooglePlaySubscription({
          subscription: { ...base, subscriptionState },
          purchaseToken: 'token',
          applicationId: 'ai.voucha.android',
          environment: 'test',
          expectedProduct: expected,
        }),
      ).toEqual({ accepted: false, reasonCode: 'invalid_evidence' })
    expect(
      verifyGooglePlaySubscription({
        subscription: { ...base, subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toMatchObject({
      accepted: true,
      acknowledgementPending: false,
      observation: { lifecycle: 'paused' },
    })
  })

  it('checks ownership before binding a pending or out-of-app purchase', () => {
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          ...base,
          subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
          externalAccountIdentifiers: { obfuscatedExternalAccountId: 'someone-else' },
        },
        purchaseToken: 'pending-token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toEqual({ accepted: false, reasonCode: 'wrong_account' })
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          ...base,
          externalAccountIdentifiers: undefined,
          outOfAppPurchaseContext: {
            expiredPurchaseToken: 'old-token',
            expiredExternalAccountIdentifiers: { obfuscatedExternalAccountId: 'account-hash' },
          },
        },
        purchaseToken: 'out-of-app-token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toMatchObject({ accepted: true })
  })

  it('rejects purchases from the wrong provider environment', () => {
    expect(
      verifyGooglePlaySubscription({
        subscription: base,
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'production',
        expectedProduct: expected,
      }),
    ).toEqual({ accepted: false, reasonCode: 'wrong_environment' })
    expect(
      verifyGooglePlaySubscription({
        subscription: { ...base, testPurchase: undefined },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toEqual({ accepted: false, reasonCode: 'wrong_environment' })
  })

  it('rejects an active purchase whose account identifier does not belong to the user', () => {
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          ...base,
          externalAccountIdentifiers: { obfuscatedExternalAccountId: 'someone-else' },
        },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toEqual({ accepted: false, reasonCode: 'wrong_account' })
  })

  it('requests acknowledgement only for a purchased, still-entitled term', () => {
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          ...base,
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toMatchObject({ accepted: true, acknowledgementPending: false })
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          ...base,
          subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
        },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toEqual({ accepted: false, reasonCode: 'purchase_pending', bindablePending: true })
    expect(
      verifyGooglePlaySubscription({
        subscription: { ...base, subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toMatchObject({ accepted: true, acknowledgementPending: true })
    expect(
      verifyGooglePlaySubscription({
        subscription: {
          ...base,
          lineItems: [{ productId: 'plus.monthly', expiryTime: '2020-01-01T00:00:00Z' }],
        },
        purchaseToken: 'token',
        applicationId: 'ai.voucha.android',
        environment: 'test',
        expectedProduct: expected,
      }),
    ).toMatchObject({ accepted: true, acknowledgementPending: false })
  })
})
