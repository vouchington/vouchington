import { describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import type { UserReferralLink } from './types.mts'
import { assertUserReferralLinkScope } from './scope.mts'

const baseLink: UserReferralLink = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  referral_program_id: '33333333-3333-4333-8333-333333333333',
  url_id: '44444444-4444-4444-8444-444444444444',
  label: null,
  activated_at: null,
  deactivated_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  consecutive_crawl_failures: 0,
  last_crawl_failure_at: null,
  last_crawl_success_at: null,
  last_crawl_id: null,
  parent_link_id: null,
  unfurl_requested_at: null,
  unfurl_completed_at: null,
  unfurl_failed_at: null,
  unfurl_last_error: null,
}

function createUser(id: string, roles: string[] = []): PrivateUser {
  return {
    __entity_type: 'user',
    id,
    roles,
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
  } as PrivateUser
}

describe('assertUserReferralLinkScope', () => {
  it('returns early when scope is omitted', () => {
    const currentUser = createUser(baseLink.user_id)

    expect(() => assertUserReferralLinkScope(currentUser, baseLink)).not.toThrow()
  })

  it('allows matching user_id scope for non-admin', () => {
    const currentUser = createUser(baseLink.user_id)

    expect(() =>
      assertUserReferralLinkScope(currentUser, baseLink, { user_id: baseLink.user_id }),
    ).not.toThrow()
  })

  it('rejects mismatched user_id scope for non-admin', () => {
    const currentUser = createUser(baseLink.user_id)

    expect(() =>
      assertUserReferralLinkScope(currentUser, baseLink, {
        user_id: '55555555-5555-4555-8555-555555555555',
      }),
    ).toThrow('Referral link not found')
  })

  it('allows mismatched user_id scope for admin', () => {
    const currentUser = createUser('66666666-6666-4666-8666-666666666666', ['administrator'])

    expect(() =>
      assertUserReferralLinkScope(currentUser, baseLink, {
        user_id: '77777777-7777-4777-8777-777777777777',
      }),
    ).not.toThrow()
  })

  it('validates and enforces referral_program_id scope', () => {
    const currentUser = createUser(baseLink.user_id)

    expect(() =>
      assertUserReferralLinkScope(currentUser, baseLink, {
        referral_program_id: baseLink.referral_program_id,
      }),
    ).not.toThrow()

    expect(() =>
      assertUserReferralLinkScope(currentUser, baseLink, {
        referral_program_id: '88888888-8888-4888-8888-888888888888',
      }),
    ).toThrow('Referral link not found')
  })

  it('throws on invalid UUID in scope', () => {
    const currentUser = createUser(baseLink.user_id)

    expect(() =>
      assertUserReferralLinkScope(currentUser, baseLink, {
        user_id: 'not-a-uuid',
      }),
    ).toThrow('Invalid UUID')

    expect(() =>
      assertUserReferralLinkScope(currentUser, baseLink, {
        referral_program_id: 'also-not-a-uuid',
      }),
    ).toThrow('Invalid UUID')
  })
})
