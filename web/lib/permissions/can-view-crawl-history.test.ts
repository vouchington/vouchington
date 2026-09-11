import { describe, expect, it } from 'vitest'
import { canCurrentUserViewCrawlHistory } from './can-view-crawl-history'
import type { User } from '@/types/user'
import type { SubscriptionMembership } from '@/types/api-responses'

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 'u1', roles: [], ...overrides }
}

function makeMembership(overrides: Partial<SubscriptionMembership> = {}): SubscriptionMembership {
  return {
    __entity_type: 'membership',
    id: 'membership-1',
    user_id: 'u1',
    plan: 'plus',
    status: 'active',
    started_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    has_stripe_subscription: true,
    granted_by_id: null,
    cancelled_at: null,
    expired_at: null,
    past_due_at: null,
    paused_at: null,
    cancel_at_period_end: false,
    latest_change_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    sku: {
      id: 'sku-1',
      plan: 'plus',
      price: { amount: 500, currency: 'usd' },
      interval: 'monthly',
      stripe_price_id: 'price-1',
      retired_at: null,
    },
    ...overrides,
  }
}

describe('canCurrentUserViewCrawlHistory', () => {
  it('denies free users', () => {
    expect(canCurrentUserViewCrawlHistory(makeUser({ membership_plan: null }), null)).toBe(false)
  })

  it('allows Plus and Pro users', () => {
    expect(
      canCurrentUserViewCrawlHistory(makeUser({ membership_plan: null }), makeMembership()),
    ).toBe(true)
    expect(
      canCurrentUserViewCrawlHistory(
        makeUser({ membership_plan: null }),
        makeMembership({ plan: 'pro' }),
      ),
    ).toBe(true)
  })

  it('allows administrators without a paid membership', () => {
    expect(
      canCurrentUserViewCrawlHistory(
        makeUser({ roles: ['administrator'], membership_plan: null }),
        null,
      ),
    ).toBe(true)
  })

  it('denies an expired Plus membership despite a stale identity plan', () => {
    expect(
      canCurrentUserViewCrawlHistory(
        makeUser({ membership_plan: 'plus' }),
        makeMembership({ expires_at: '2020-01-01T00:00:00.000Z' }),
      ),
    ).toBe(false)
  })
})
