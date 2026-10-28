import { describe, expect, it } from 'vitest'
import type { Membership } from '@voucha/types/entities/membership'
import { hasPlusTier, hasUnexpiredPlusTier } from './tier-helpers.mts'

const fixedNow = new Date('2026-10-05T23:59:40.000Z')

function makeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    __entity_type: 'membership',
    id: 'test-id',
    user_id: 'user-id',
    plan: 'plus',
    status: 'active',
    started_at: fixedNow,
    expires_at: null,
    stripe_subscription_id: null,
    stripe_customer_id: null,
    granted_by_id: null,
    cancelled_at: null,
    expired_at: null,
    past_due_at: null,
    paused_at: null,
    should_cancel_at_period_end: false,
    latest_change_id: null,
    created_at: fixedNow,
    updated_at: fixedNow,
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

describe('hasPlusTier status cases', () => {
  it('returns false for null', () => {
    expect(hasPlusTier(null, fixedNow)).toBe(false)
  })

  it('returns true for active status', () => {
    expect(hasPlusTier(makeMembership({ status: 'active' }), fixedNow)).toBe(true)
  })

  it('returns true for past_due status', () => {
    expect(hasPlusTier(makeMembership({ status: 'past_due' }), fixedNow)).toBe(true)
  })

  it('keeps a Stripe subscription active after its period end', () => {
    expect(
      hasPlusTier(
        makeMembership({
          stripe_subscription_id: 'sub_lapsed',
          expires_at: new Date(fixedNow.getTime() - 1_000),
        }),
        fixedNow,
      ),
    ).toBe(true)
  })

  it('returns false for cancelled status', () => {
    expect(hasPlusTier(makeMembership({ status: 'cancelled' }), fixedNow)).toBe(false)
  })

  it('returns false for expired status', () => {
    expect(hasPlusTier(makeMembership({ status: 'expired' }), fixedNow)).toBe(false)
  })

  it('returns false for paused status', () => {
    expect(hasPlusTier(makeMembership({ status: 'paused' }), fixedNow)).toBe(false)
  })
})

describe('hasPlusTier', () => {
  it('returns false for an elapsed grant', () => {
    const elapsed = new Date(fixedNow.getTime() - 1_000)
    expect(hasPlusTier(makeMembership({ expires_at: elapsed }), fixedNow)).toBe(false)
  })

  it('returns true for active pro', () => {
    expect(hasPlusTier(makeMembership({ plan: 'pro' }), fixedNow)).toBe(true)
  })
})

describe('hasUnexpiredPlusTier', () => {
  const now = fixedNow

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
