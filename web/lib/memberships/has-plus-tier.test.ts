/* No mocks — pure utility function */
import { describe, it, expect } from 'vitest'
import { hasPlusTier } from './has-plus-tier'
import type { SubscriptionMembership } from '@/types/api-responses'

function makeMembership(overrides?: Partial<SubscriptionMembership>): SubscriptionMembership {
  return {
    __entity_type: 'membership',
    id: 'membership-1',
    user_id: 'user-1',
    plan: 'plus',
    status: 'active',
    started_at: '2024-01-01T00:00:00Z',
    expires_at: null,
    has_stripe_subscription: true,
    granted_by_id: null,
    cancelled_at: null,
    expired_at: null,
    past_due_at: null,
    paused_at: null,
    cancel_at_period_end: false,
    latest_change_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    sku: {
      id: 'sku-1',
      plan: 'plus',
      price: { amount: 500, currency: 'usd' },
      interval: 'month',
      stripe_price_id: 'price_1',
      retired_at: null,
    },
    ...overrides,
  }
}

describe('hasPlusTier', () => {
  it('returns false for null membership', () => {
    expect(hasPlusTier(null)).toBe(false)
  })

  it('returns true for an active plus membership', () => {
    expect(hasPlusTier(makeMembership({ plan: 'plus', status: 'active' }))).toBe(true)
  })

  it('returns true for an active pro membership', () => {
    expect(hasPlusTier(makeMembership({ plan: 'pro', status: 'active' }))).toBe(true)
  })

  it('returns true for a past_due plus membership (still active per the shared predicate)', () => {
    expect(hasPlusTier(makeMembership({ plan: 'plus', status: 'past_due' }))).toBe(true)
  })

  it('returns false for a free plan', () => {
    expect(hasPlusTier(makeMembership({ plan: 'free', status: 'active' }))).toBe(false)
  })

  it('returns false for a cancelled plus membership', () => {
    expect(hasPlusTier(makeMembership({ plan: 'plus', status: 'cancelled' }))).toBe(false)
  })

  it('returns false for an expired plus membership', () => {
    expect(hasPlusTier(makeMembership({ plan: 'plus', status: 'expired' }))).toBe(false)
  })
})
