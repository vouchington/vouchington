import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { UserPrivacyAudience, UserPrivacySettings } from './types.mts'

const VALID_PRIVACY_AUDIENCES = new Set<UserPrivacyAudience>([
  'everyone',
  'users',
  'followers',
  'mutual_followers',
  'nobody',
])

export function isValidPrivacyAudience(value: unknown): value is UserPrivacyAudience {
  return typeof value === 'string' && VALID_PRIVACY_AUDIENCES.has(value as UserPrivacyAudience)
}

export async function getUserPrivacySettings(userId: string): Promise<UserPrivacySettings> {
  const { rows } = await read(sql`/* getUserPrivacySettings */
    SELECT
      cards_visibility,
      rewards_program_statuses_visibility,
      spending_categories_visibility,
      follows_visibility,
      topic_follows_visibility,
      rss_feed_follows_visibility,
      community_memberships_visibility,
      followers_visibility,
      likes_visibility,
      default_post_broadcast,
      default_post_privacy,
      engagement_emails_enabled,
      news_digest_frequency,
      moderation_emails_enabled,
      community_digest_frequency,
      moderation_email_cadence,
      moderation_email_days_of_week,
      moderation_email_time_of_day,
      moderation_email_timezone
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
  `)
  assert(rows.length > 0, 404, 'User not found')
  return rows[0] as UserPrivacySettings
}
