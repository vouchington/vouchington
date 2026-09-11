import { describe, it, expect } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanCreateCommunity, assertCanCreateCommunity } from './authorization.mts'
import { IDENTITY_REQUIRED } from '@modules/on-error/error-codes'

function createMockUser(overrides: Partial<PrivateUser> = {}): PrivateUser {
  return {
    __entity_type: 'user',
    id: overrides.id ?? uuidv7(),
    roles: [],
    username: 'testuser',
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

describe('currentUserCanCreateCommunity', () => {
  it('returns true for any user with a username (no membership required)', () => {
    const user = createMockUser()
    expect(currentUserCanCreateCommunity(user)).toBe(true)
  })

  it('returns false for user without username', () => {
    const user = createMockUser({ username: undefined })
    expect(currentUserCanCreateCommunity(user)).toBe(false)
  })

  it('returns true for admin regardless of username', () => {
    const user = createMockUser({ roles: ['administrator'], username: undefined })
    expect(currentUserCanCreateCommunity(user)).toBe(true)
  })
})

describe('assertCanCreateCommunity', () => {
  it('does not throw for user with username', () => {
    const user = createMockUser()
    expect(() => assertCanCreateCommunity(user)).not.toThrow()
  })

  it('throws IDENTITY_REQUIRED for user without username', () => {
    const user = createMockUser({ username: undefined })
    expect(() => assertCanCreateCommunity(user)).toThrow(
      expect.objectContaining({ code: IDENTITY_REQUIRED }),
    )
  })

  it('does not throw for admin without username', () => {
    const user = createMockUser({ roles: ['administrator'], username: undefined })
    expect(() => assertCanCreateCommunity(user)).not.toThrow()
  })
})
