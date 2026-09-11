import { afterEach, describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  isMembershipAutomaticCollisionResolutionEnabled,
  isMembershipPurchaseEnabled,
  membershipBillingControls,
} from './purchase-controls.mts'

describe('membership billing controls', () => {
  let restore: (() => void) | undefined

  afterEach(() => restore?.())

  it('defaults every provider purchase and collision path off', () => {
    for (const provider of [
      'stripe',
      'apple_app_store',
      'google_play',
      'microsoft_store',
    ] as const) {
      expect(isMembershipPurchaseEnabled(provider)).toBe(false)
      expect(isMembershipAutomaticCollisionResolutionEnabled(provider)).toBe(false)
    }
  })

  it('controls purchase and collision resolution independently per provider', () => {
    restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      google_play_enabled: true,
      google_play_automatic_collision_resolution_enabled: false,
      microsoft_store_enabled: false,
      microsoft_store_automatic_collision_resolution_enabled: true,
    })

    expect(isMembershipPurchaseEnabled('google_play')).toBe(true)
    expect(isMembershipAutomaticCollisionResolutionEnabled('google_play')).toBe(false)
    expect(isMembershipPurchaseEnabled('microsoft_store')).toBe(false)
    expect(isMembershipAutomaticCollisionResolutionEnabled('microsoft_store')).toBe(true)
  })
})
