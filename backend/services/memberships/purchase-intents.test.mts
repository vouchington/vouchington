import { describe, expect, it } from 'vitest'
import {
  createMembershipPurchaseIntentFingerprint,
  toPurchaseIntent,
  type PurchaseIntentRow,
} from './purchase-intents.mts'

const row: PurchaseIntentRow = {
  application_id: 'voucha-app',
  base_plan_id: null,
  environment: 'test',
  expires_at: new Date('2026-01-01T00:00:00Z'),
  failed_at: null,
  failure_code: null,
  id: 'intent-a',
  launched_at: new Date('2025-01-01T00:00:00Z'),
  membership_product_id: 'product-a',
  offer_id: null,
  plan: 'plus',
  provider: 'apple_app_store',
  provider_checkout_url: null,
  provider_product_id: 'plus.monthly',
  request_fingerprint: 'fingerprint-a',
  sku_id: null,
  user_id: 'user-a',
}

describe('membership purchase intents', () => {
  it('fingerprints the provider and canonical product deterministically', () => {
    expect(createMembershipPurchaseIntentFingerprint('apple_app_store', 'product-a')).toBe(
      createMembershipPurchaseIntentFingerprint('apple_app_store', 'product-a'),
    )
    expect(createMembershipPurchaseIntentFingerprint('google_play', 'product-a')).not.toBe(
      createMembershipPurchaseIntentFingerprint('apple_app_store', 'product-a'),
    )
  })

  it('projects native launches without exposing internal mapping IDs', () => {
    expect(
      toPurchaseIntent({ ...row, provider: 'google_play', base_plan_id: 'monthly' }, false),
    ).toEqual({
      id: 'intent-a',
      provider: 'google_play',
      product_id: 'product-a',
      launch: {
        kind: 'google_play',
        product_id: 'plus.monthly',
        base_plan_id: 'monthly',
        offer_id: null,
        obfuscated_account_id: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      replayed: false,
    })
    expect(toPurchaseIntent({ ...row, provider: 'apple_app_store' }, true).launch).toEqual({
      kind: 'apple_app_store',
      product_id: 'plus.monthly',
      app_account_token: 'intent-a',
    })
    expect(
      toPurchaseIntent({ ...row, provider: 'microsoft_store', sku_id: 'monthly' }, false).launch,
    ).toEqual({ kind: 'microsoft_store', product_id: 'plus.monthly', sku_id: 'monthly' })
  })

  it('requires a Checkout URL for a launched Stripe intent', () => {
    expect(() => toPurchaseIntent({ ...row, provider: 'stripe' }, false)).toThrow(
      'Launched Stripe purchase intent has no Checkout URL',
    )
    expect(
      toPurchaseIntent(
        { ...row, provider: 'stripe', provider_checkout_url: 'https://example.com/checkout' },
        true,
      ).launch,
    ).toEqual({ kind: 'stripe_checkout', checkout_url: 'https://example.com/checkout' })
  })
})
