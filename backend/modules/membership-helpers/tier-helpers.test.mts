import { describe, expect, it } from 'vitest'
import type { Membership } from '@voucha/types/entities/membership'
import {
  isActiveMembership,
  hasPlusTier,
  hasProTier,
  hasUnexpiredPlusTier,
} from './tier-helpers.mts'

function makeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    __entity_type: 'membership',
    id: 'test-id',
    user_id: 'user-id',
    plan: 'plus',
    status: 'active',
    started_at: new Date(),
    expires_at: null,
    stripe_subscription_id: null,
    stripe_customer_id: null,
    granted_by_id: null,
    cancelled_at: null,
    expired_at: null,
    past_due_at: null,
    paused_at: null,
    cancel_at_period_end: false,
    latest_change_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    sku: {
      id: 'sku-id',
      plan: 'plus',
      price: { amount: 999, currency: 'usd' },
      interval: 'monthly',
      stripe_price_id: 'price_test',
      retired_at: null,
    },
    ...overrides,
  }
}

describe('isActiveMembership', () => {
  it('returns false for null', () => {
    expect(isActiveMembership(null)).toBe(false)
  })

  it('returns true for active status', () => {
    expect(isActiveMembership(makeMembership({ status: 'active' }))).toBe(true)
  })

  it('returns true for past_due status', () => {
    expect(isActiveMembership(makeMembership({ status: 'past_due' }))).toBe(true)
  })

  it('keeps a Stripe subscription active after its period end', () => {
    expect(
      isActiveMembership(
        makeMembership({
          stripe_subscription_id: 'sub_lapsed',
          expires_at: new Date(Date.now() - 1_000),
        }),
      ),
    ).toBe(true)
  })

  it('returns false for cancelled status', () => {
    expect(isActiveMembership(makeMembership({ status: 'cancelled' }))).toBe(false)
  })

  it('returns false for expired status', () => {
    expect(isActiveMembership(makeMembership({ status: 'expired' }))).toBe(false)
  })

  it('returns false for paused status', () => {
    expect(isActiveMembership(makeMembership({ status: 'paused' }))).toBe(false)
  })
})

describe('hasPlusTier', () => {
  it('returns true for active plus', () => {
    expect(hasPlusTier(makeMembership({ plan: 'plus' }))).toBe(true)
  })

  it('returns false for an elapsed grant and true for an elapsed Stripe period', () => {
    const elapsed = new Date(Date.now() - 1_000)
    expect(hasPlusTier(makeMembership({ expires_at: elapsed }))).toBe(false)
    expect(
      hasPlusTier(
        makeMembership({
          stripe_subscription_id: 'sub_lapsed',
          expires_at: elapsed,
        }),
      ),
    ).toBe(true)
  })

  it('returns true for active pro', () => {
    expect(hasPlusTier(makeMembership({ plan: 'pro' }))).toBe(true)
  })

  it('returns false for null', () => {
    expect(hasPlusTier(null)).toBe(false)
  })

  it('returns false for cancelled', () => {
    expect(hasPlusTier(makeMembership({ status: 'cancelled' }))).toBe(false)
  })
})

describe('hasProTier', () => {
  it('returns true for active pro', () => {
    expect(hasProTier(makeMembership({ plan: 'pro' }))).toBe(true)
  })

  it('returns false for active plus', () => {
    expect(hasProTier(makeMembership({ plan: 'plus' }))).toBe(false)
  })
})

describe('hasUnexpiredPlusTier', () => {
  const now = new Date('2026-08-16T12:00:00.000Z')

  it('accepts no expiration or a future expiration', () => {
    expect(hasUnexpiredPlusTier(makeMembership({ expires_at: null }), now)).toBe(true)
    expect(
      hasUnexpiredPlusTier(makeMembership({ expires_at: new Date(now.getTime() + 1) }), now),
    ).toBe(true)
  })

  it('rejects the exact expiration boundary and the past', () => {
    expect(hasUnexpiredPlusTier(makeMembership({ expires_at: now }), now)).toBe(false)
    expect(
      hasUnexpiredPlusTier(makeMembership({ expires_at: new Date(now.getTime() - 1) }), now),
    ).toBe(false)
  })

  it('keeps a Stripe subscription entitled after its period end', () => {
    expect(
      hasUnexpiredPlusTier(
        makeMembership({
          stripe_subscription_id: 'sub_lapsed',
          expires_at: new Date(now.getTime() - 1),
        }),
        now,
      ),
    ).toBe(true)
  })
})
