import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { updateUserFields } from './update-fields.mts'
import type { PrivateUser } from '@services/users/types'
import { isValidPrivacyAudience, getUserPrivacySettings } from './privacy.mts'

describe('isValidPrivacyAudience', () => {
  it('returns true for all valid audience values', () => {
    expect(isValidPrivacyAudience('everyone')).toBe(true)
    expect(isValidPrivacyAudience('users')).toBe(true)
    expect(isValidPrivacyAudience('followers')).toBe(true)
    expect(isValidPrivacyAudience('mutual_followers')).toBe(true)
    expect(isValidPrivacyAudience('nobody')).toBe(true)
  })

  it('returns false for invalid strings', () => {
    expect(isValidPrivacyAudience('public')).toBe(false)
    expect(isValidPrivacyAudience('private')).toBe(false)
    expect(isValidPrivacyAudience('')).toBe(false)
    expect(isValidPrivacyAudience('EVERYONE')).toBe(false)
  })

  it('returns false for non-string values', () => {
    expect(isValidPrivacyAudience(null)).toBe(false)
    expect(isValidPrivacyAudience(undefined)).toBe(false)
    expect(isValidPrivacyAudience(1)).toBe(false)
    expect(isValidPrivacyAudience({})).toBe(false)
  })
})

describe('getUserPrivacySettings', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns default settings for a new user', async () => {
    const settings = await getUserPrivacySettings(user.id)
    expect(settings.follows_visibility).toBe('everyone')
    expect(settings.followers_visibility).toBe('everyone')
    expect(settings.likes_visibility).toBe('everyone')
    expect(settings.cards_visibility).toBe('everyone')
    expect(settings.rewards_program_statuses_visibility).toBe('everyone')
    expect(settings.spending_categories_visibility).toBe('nobody')
    expect(settings.default_post_broadcast).toBe('everyone')
    expect(settings.default_post_privacy).toBe('public')
    expect(settings.engagement_emails_enabled).toBe(true)
    expect(settings.moderation_emails_enabled).toBe(true)
    expect(settings.moderation_email_cadence).toBe('daily')
    expect(settings.moderation_email_days_of_week).toEqual([1, 2, 3, 4, 5])
    expect(settings.moderation_email_time_of_day).toBe('09:00')
    expect(settings.moderation_email_timezone).toBeNull()
  })

  it('returns updated settings after change', async () => {
    await updateUserFields(user.id, { follows_visibility: 'followers' })
    const settings = await getUserPrivacySettings(user.id)
    expect(settings.follows_visibility).toBe('followers')
  })

  it('throws 404 for nonexistent user', async () => {
    await expect(getUserPrivacySettings(crypto.randomUUID())).rejects.toMatchObject({ status: 404 })
  })
})
