import { describe, expect, it } from 'vitest'
import {
  createMembershipPurchaseIntentFingerprint,
  getNativeMembershipLaunch,
} from './purchase-intents.mts'

describe('membership purchase intents', () => {
  it('fingerprints the provider and canonical product deterministically', () => {
    expect(createMembershipPurchaseIntentFingerprint('apple_app_store', 'product-a')).toBe(
      createMembershipPurchaseIntentFingerprint('apple_app_store', 'product-a'),
    )
    expect(createMembershipPurchaseIntentFingerprint('google_play', 'product-a')).not.toBe(
      createMembershipPurchaseIntentFingerprint('apple_app_store', 'product-a'),
    )
  })

  it('builds typed native launches without exposing internal mapping IDs', () => {
    expect(
      getNativeMembershipLaunch({
        id: 'intent-a',
        provider: 'google_play',
        provider_product_id: 'plus.monthly',
        base_plan_id: 'monthly',
        offer_id: null,
        sku_id: null,
        user_id: 'user-a',
      }),
    ).toEqual({
      kind: 'google_play',
      product_id: 'plus.monthly',
      base_plan_id: 'monthly',
      offer_id: null,
      obfuscated_account_id: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('builds Microsoft Store launches and rejects Stripe native payloads', () => {
    expect(
      getNativeMembershipLaunch({
        id: 'intent-a',
        provider: 'microsoft_store',
        provider_product_id: 'voucha-plus',
        base_plan_id: null,
        offer_id: null,
        sku_id: 'monthly',
        user_id: 'user-a',
      }),
    ).toEqual({ kind: 'microsoft_store', product_id: 'voucha-plus', sku_id: 'monthly' })
    expect(() =>
      getNativeMembershipLaunch({
        id: 'intent-a',
        provider: 'stripe',
        provider_product_id: 'price_a',
        base_plan_id: null,
        offer_id: null,
        sku_id: null,
        user_id: 'user-a',
      }),
    ).toThrow('Stripe purchase intents do not use a native launch payload')
  })
})
