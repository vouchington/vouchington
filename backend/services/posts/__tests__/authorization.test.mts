import { describe, expect, it } from 'vitest'
import { currentUserCanCreatePost } from '@services/posts/authorization'
import type { PrivateUser } from '@services/users/types'

function makeUser(overrides: Partial<PrivateUser> = {}): PrivateUser {
  return {
    __entity_type: 'user',
    id: 'test-id',
    roles: [],
    cards_visibility: 'everyone',
    rewards_program_statuses_visibility: 'everyone',
    spending_categories_visibility: 'nobody',
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

describe('currentUserCanCreatePost', () => {
  it('user with username but no email and no OAuth cannot create posts', () => {
    const user = makeUser({ username: 'alice' })
    expect(currentUserCanCreatePost(user)).toBe(false)
  })

  it('user with OAuth but no username can create posts', () => {
    const user = makeUser({ google_account: { id: 'g123', name: 'Alice', email_address: null } })
    expect(currentUserCanCreatePost(user)).toBe(true)
  })

  it('user with neither username nor OAuth cannot create posts', () => {
    const user = makeUser()
    expect(currentUserCanCreatePost(user)).toBe(false)
  })

  it('admin with neither username nor OAuth can create posts', () => {
    const user = makeUser({ roles: ['administrator'] })
    expect(currentUserCanCreatePost(user)).toBe(true)
  })

  it('user with facebook account can create posts', () => {
    const user = makeUser({ facebook_account: { id: 'f123', name: 'Alice', email_address: null } })
    expect(currentUserCanCreatePost(user)).toBe(true)
  })

  it('user with github account can create posts', () => {
    const user = makeUser({ github_account: { id: 'gh123', name: 'Alice', email_address: null } })
    expect(currentUserCanCreatePost(user)).toBe(true)
  })
})
