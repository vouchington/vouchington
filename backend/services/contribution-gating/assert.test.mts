import { describe, it, expect } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type { PrivateUser } from '@voucha/types/entities/user'
import { getContributionStatus, assertCanContribute } from './assert.mts'
import { CONTRIBUTION_GATED, EMAIL_VERIFICATION_REQUIRED } from '@modules/on-error/error-codes'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// Account created 2 days ago — always < 7 days old relative to Date.now()
const newAccountId = uuidv7({ msecs: Date.now() - 2 * ONE_DAY_MS })

function makeMockUser(overrides: Partial<PrivateUser> = {}): PrivateUser {
  return {
    __entity_type: 'user',
    id: uuidv7(),
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

describe('getContributionStatus', () => {
  it('allows admins unconditionally', async () => {
    const user = makeMockUser({ id: newAccountId, roles: ['administrator'] })
    const status = await getContributionStatus(user, { membershipPlan: null })
    expect(status.allowed).toBe(true)
  })

  it('allows users with active paid membership (plus)', async () => {
    const user = makeMockUser({ id: newAccountId })
    const status = await getContributionStatus(user, { membershipPlan: 'plus' })
    expect(status.allowed).toBe(true)
  })

  it('allows users with pro membership', async () => {
    const user = makeMockUser({ id: newAccountId })
    const status = await getContributionStatus(user, { membershipPlan: 'pro' })
    expect(status.allowed).toBe(true)
  })

  it('skips the seven-day gate for identity-verified free users but retains email verification', async () => {
    const user = makeMockUser({ id: newAccountId, verification_status: 'verified' })
    const status = await getContributionStatus(user, { membershipPlan: null })
    expect(status).toMatchObject({ allowed: false, reason: 'email_verification_required' })
  })

  it('gates new accounts (< 7 days) without paid membership', async () => {
    const user = makeMockUser({ id: newAccountId })
    const status = await getContributionStatus(user, { membershipPlan: null })
    expect(status.allowed).toBe(false)
    expect(status.reason).toBe('account_too_new')
    expect(status.gated_until).toBeInstanceOf(Date)
  })

  it('skips the age gate when requested and still requires verified email', async () => {
    const user = makeMockUser({ id: newAccountId })
    const status = await getContributionStatus(user, {
      membershipPlan: null,
      skipAccountAgeGate: true,
    })
    expect(status.allowed).toBe(false)
    expect(status.reason).toBe('email_verification_required')
    expect(status.gated_until).toBeUndefined()
  })

  it('skips age gate for non-UUIDv7 ids and falls through to email verification', async () => {
    // v4 UUID — getDateFromUUIDv7 returns null, so the age gate is skipped.
    // In production all users have UUIDv7 ids (DB default uuidv7()); non-v7 ids
    // only appear in seeded/legacy rows. This test locks in the fail-through behavior:
    // such users bypass the age check and land on the email verification step.
    const nonV7Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const user = makeMockUser({ id: nonV7Id })
    const status = await getContributionStatus(user, { membershipPlan: null })
    // Age gate skipped; no email exists for this id → falls through to email check
    expect(status.allowed).toBe(false)
    expect(status.reason).toBe('email_verification_required')
  })
})

describe('assertCanContribute', () => {
  it('does not throw for admin', async () => {
    const user = makeMockUser({ id: newAccountId, roles: ['administrator'] })
    await expect(assertCanContribute(user, { membershipPlan: null })).resolves.toBeUndefined()
  })

  it('does not throw for paid member', async () => {
    const user = makeMockUser({ id: newAccountId })
    await expect(assertCanContribute(user, { membershipPlan: 'plus' })).resolves.toBeUndefined()
  })

  it('throws CONTRIBUTION_GATED for new account without membership', async () => {
    const user = makeMockUser({ id: newAccountId })
    await expect(assertCanContribute(user, { membershipPlan: null })).rejects.toMatchObject({
      code: CONTRIBUTION_GATED,
      status: 403,
    })
  })

  it('throws EMAIL_VERIFICATION_REQUIRED when email is the only failed gate', async () => {
    const user = makeMockUser({ id: newAccountId })
    await expect(
      assertCanContribute(user, { membershipPlan: null, skipAccountAgeGate: true }),
    ).rejects.toMatchObject({ code: EMAIL_VERIFICATION_REQUIRED, status: 403 })
  })
})
