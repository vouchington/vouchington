import { describe, it, expect } from 'vitest'
import { currentUserCanUpdateIdentityVerification } from '../authorization.mts'
import type { PrivateUser } from '@services/users/types'

function makeUser(overrides: Partial<PrivateUser> = {}): PrivateUser {
  return {
    __entity_type: 'user',
    id: 'user-1',
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

describe('currentUserCanUpdateIdentityVerification', () => {
  it('allows a user to update their own identity verification', () => {
    const user = makeUser({ id: 'user-1' })
    expect(currentUserCanUpdateIdentityVerification(user, 'user-1')).toBe(true)
  })

  it('denies a regular user from updating another user', () => {
    const user = makeUser({ id: 'user-1' })
    expect(currentUserCanUpdateIdentityVerification(user, 'user-2')).toBe(false)
  })

  it('allows an administrator to update any user', () => {
    const admin = makeUser({ id: 'admin-1', roles: ['administrator'] })
    expect(currentUserCanUpdateIdentityVerification(admin, 'user-2')).toBe(true)
  })

  it('allows an administrator to update themselves', () => {
    const admin = makeUser({ id: 'admin-1', roles: ['administrator'] })
    expect(currentUserCanUpdateIdentityVerification(admin, 'admin-1')).toBe(true)
  })
})
