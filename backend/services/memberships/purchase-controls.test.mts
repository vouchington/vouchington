import { afterEach, describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { isMembershipPurchaseEnabled, membershipBillingControls } from './purchase-controls.mts'

describe('membership billing controls', () => {
  let restore: (() => void) | undefined

  afterEach(() => restore?.())

  it('defaults every provider purchase path off', () => {
    for (const provider of [
      'stripe',
      'apple_app_store',
      'google_play',
      'microsoft_store',
    ] as const) {
      expect(isMembershipPurchaseEnabled(provider)).toBe(false)
    }
  })

  it('controls purchases independently per provider', () => {
    restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      google_play_enabled: true,
      microsoft_store_enabled: false,
    })

    expect(isMembershipPurchaseEnabled('google_play')).toBe(true)
    expect(isMembershipPurchaseEnabled('microsoft_store')).toBe(false)
  })
})
