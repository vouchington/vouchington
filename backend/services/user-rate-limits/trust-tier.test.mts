import { describe, it, expect } from 'vitest'
import { computeTrustTier } from './trust-tier.mts'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { TrustTierContext } from './types.mts'
import { v7 as uuidv7 } from 'uuid'

// Default to a 25h-old account so the 24h cooling period does not apply
// in tests that focus on OAuth/membership signals, not the cooling period.
const TWENTY_FIVE_HOURS_AGO = new Date(Date.now() - 25 * 60 * 60 * 1000)

function createMockUser(overrides: Partial<PrivateUser> = {}): PrivateUser {
  return {
    __entity_type: 'user',
    id: overrides.id ?? uuidv7ForDate(TWENTY_FIVE_HOURS_AGO),
    roles: [],
    cards_visibility: 'everyone',
    rewards_program_statuses_visibility: 'everyone',
    spending_categories_visibility: 'everyone',
    follows_visibility: 'everyone',
    topic_follows_visibility: 'everyone',
    rss_feed_follows_visibility: 'everyone',
    community_memberships_visibility: 'everyone',
    followers_visibility: 'everyone',
    likes_visibility: 'everyone',
    direct_messages_audience: 'everyone',
    default_post_broadcast: 'everyone',
    default_post_privacy: 'public',
    engagement_emails_enabled: true,
    news_digest_frequency: 'weekly',
    moderation_emails_enabled: true,
    community_digest_frequency: 'weekly',
    moderation_email_cadence: 'daily',
    moderation_email_days_of_week: [1, 2, 3, 4, 5],
    moderation_email_time_of_day: '09:00',
    moderation_email_timezone: 'America/Los_Angeles',
    fediverse_federation_enabled: false,
    ...overrides,
  }
}

function createFreshUser(overrides: Partial<PrivateUser> = {}): PrivateUser {
  return createMockUser({ id: uuidv7(), ...overrides })
}

function uuidv7ForDate(date: Date): string {
  return uuidv7({ msecs: date.getTime() })
}

const baseContext: TrustTierContext = {
  membershipPlan: null,
}

describe('computeTrustTier', () => {
  it('returns tier 0 for a new account (< 24h) regardless of other signals', () => {
    const user = createFreshUser()
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(0)
  })

  it('returns tier 2 for a user with an OAuth account', () => {
    const user = createMockUser({
      google_account: { id: '123', name: 'Test', email_address: 'test@test.com' },
    })
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(2)
  })

  it('adds +0.5 for account age > 30 days', () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    const user = createMockUser({ id: uuidv7ForDate(thirtyOneDaysAgo) })
    // base 1 + 0.5 = 1.5 → tier 1
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(1)
  })

  it('adds +1 for account age > 6 months', () => {
    const sevenMonthsAgo = new Date(Date.now() - 210 * 24 * 60 * 60 * 1000)
    const user = createMockUser({ id: uuidv7ForDate(sevenMonthsAgo) })
    // base 1 + 1 = 2 → tier 2
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(2)
  })

  it('adds +1.5 for account age > 1 year', () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    const user = createMockUser({ id: uuidv7ForDate(twoYearsAgo) })
    // base 1 + 1.5 = 2.5 → tier 2
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(2)
  })

  it('adds +1 for plus membership', () => {
    const user = createMockUser()
    const tier = computeTrustTier(user, { membershipPlan: 'plus' })
    // base 1 + 1 = 2 → tier 2
    expect(tier).toBe(2)
  })

  it('adds +1.5 for pro membership', () => {
    const user = createMockUser()
    const tier = computeTrustTier(user, { membershipPlan: 'pro' })
    // base 1 + 1.5 = 2.5 → tier 2
    expect(tier).toBe(2)
  })

  it('returns tier 5 for a pro member with OAuth and old account', () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    const user = createMockUser({
      id: uuidv7ForDate(twoYearsAgo),
      github_account: { id: '456', name: 'Test', email_address: 'test@test.com' },
    })
    // base 1 + OAuth 1 + age 1.5 + pro 1.5 = 5 → tier 5
    const tier = computeTrustTier(user, { membershipPlan: 'pro' })
    expect(tier).toBe(5)
  })

  it('clamps tier to maximum of 5', () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    const user = createMockUser({
      id: uuidv7ForDate(twoYearsAgo),
      google_account: { id: '123', name: 'Test', email_address: 'test@test.com' },
      facebook_account: { id: '456', name: 'Test', email_address: null },
    })
    // base 1 + OAuth 1 + age 1.5 + pro 1.5 = 5 → tier 5 (clamped)
    const tier = computeTrustTier(user, { membershipPlan: 'pro' })
    expect(tier).toBe(5)
  })

  it('never returns below tier 0', () => {
    const user = createFreshUser()
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBeGreaterThanOrEqual(0)
  })

  it('handles user with multiple OAuth providers', () => {
    const user = createMockUser({
      google_account: { id: '1', name: 'T', email_address: null },
      apple_account: { id: '2', name: 'T', email_address: null },
      github_account: { id: '3', name: 'T', email_address: null },
    })
    // OAuth bonus is +1 regardless of how many providers
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(2)
  })

  it('returns tier 4 for plus member with OAuth and 7-month-old account', () => {
    const sevenMonthsAgo = new Date(Date.now() - 210 * 24 * 60 * 60 * 1000)
    const user = createMockUser({
      id: uuidv7ForDate(sevenMonthsAgo),
      google_account: { id: '123', name: 'Test', email_address: null },
    })
    // base 1 + OAuth 1 + age 1 + plus 1 = 4 → tier 4
    const tier = computeTrustTier(user, { membershipPlan: 'plus' })
    expect(tier).toBe(4)
  })

  it('clamps new account (< 24h) to tier 0 regardless of OAuth and membership', () => {
    const user = createFreshUser({
      google_account: { id: '123', name: 'Test', email_address: 'test@test.com' },
    })
    // Would be tier 3+ without the cooling period; must return 0
    const tier = computeTrustTier(user, { membershipPlan: 'pro' })
    expect(tier).toBe(0)
  })

  it('returns tier 5 for admin with new account', () => {
    const user = createFreshUser({ roles: ['administrator'] })
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(5)
  })

  it('applies normal scoring for account at 25h old', () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000)
    const user = createMockUser({
      id: uuidv7ForDate(twentyFiveHoursAgo),
      google_account: { id: '123', name: 'Test', email_address: null },
    })
    // base 1 + OAuth 1 = 2 → tier 2 (normal scoring applies)
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(2)
  })

  it('treats non-UUIDv7 IDs as ancient accounts (passes all age gates)', () => {
    // Seeded fixture users with all-zero UUIDs have no parseable timestamp;
    // they must not be blocked by age gates.
    const user = createMockUser({ id: '00000000-0000-0000-0000-000000000000' })
    // base 1 + age-1yr bonus 1.5 = 2.5 → tier 2
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(2)
  })

  it('adds +1 for identity-verified users', () => {
    const user = createMockUser({
      verification_status: 'verified',
    } as unknown as Partial<PrivateUser>)
    // base 1 + verified 1 = 2 → tier 2
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(2)
  })

  it('does not add identity bonus for unverified users', () => {
    const user = createMockUser({
      verification_status: 'unverified',
    } as unknown as Partial<PrivateUser>)
    // base 1 only → tier 1
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(1)
  })

  it('identity bonus is capped at 5 together with other signals', () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    const user = createMockUser({
      id: uuidv7ForDate(twoYearsAgo),
      google_account: { id: '123', name: 'Test', email_address: 'test@test.com' },
      verification_status: 'verified',
    } as unknown as Partial<PrivateUser>)
    // base 1 + OAuth 1 + age 1.5 + pro 1.5 + verified 1 = 6 → capped at 5
    const tier = computeTrustTier(user, { membershipPlan: 'pro' })
    expect(tier).toBe(5)
  })

  it('subtracts BAD_FAITH_REPORTER_PENALTY when bad_faith_reporter_at is set', () => {
    // base 1 + OAuth 1 = score 2 → tier 2 normally
    const user = createMockUser({
      google_account: { id: '123', name: 'Test', email_address: 'test@test.com' },
      bad_faith_reporter_at: new Date(),
    } as unknown as Partial<PrivateUser>)
    // base 1 + OAuth 1 - penalty 2 = 0 → tier 0
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(0)
  })

  it('bad_faith_reporter_at does not reduce tier below 0', () => {
    // New 25h-old account: base 1, no bonuses, penalty 2 → score -1 → clamp to 0
    const user = createMockUser({
      bad_faith_reporter_at: new Date(),
    } as unknown as Partial<PrivateUser>)
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(0)
  })

  it('bad_faith_reporter_at has no effect on administrator (tier always 5)', () => {
    const user = createMockUser({
      roles: ['administrator'],
      bad_faith_reporter_at: new Date(),
    } as unknown as Partial<PrivateUser>)
    const tier = computeTrustTier(user, baseContext)
    expect(tier).toBe(5)
  })
})
