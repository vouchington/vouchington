import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type EngagementEmailType = 'follow_topics' | 'post_referral_link' | 'follow_news_sources'

export async function claimEngagementEmailSend(
  userId: string,
  emailType: EngagementEmailType,
): Promise<boolean> {
  const { rows } = await write(sql`/* claimEngagementEmailSend */
    INSERT INTO user_engagement_email_sends (user_id, email_type)
    VALUES (${userId}, ${emailType})
    ON CONFLICT (user_id, email_type) DO UPDATE
      SET claimed_at = CURRENT_TIMESTAMP
      WHERE user_engagement_email_sends.sent_at IS NULL
        AND user_engagement_email_sends.delivery_attempted_at IS NULL
        AND user_engagement_email_sends.claimed_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
    RETURNING user_id
  `)
  return rows.length > 0
}

export async function markEngagementEmailDeliveryAttempted(
  userId: string,
  emailType: EngagementEmailType,
): Promise<boolean> {
  const { rows } = await write(sql`/* markEngagementEmailDeliveryAttempted */
    UPDATE user_engagement_email_sends
    SET delivery_attempted_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
      AND email_type = ${emailType}
      AND sent_at IS NULL
      AND delivery_attempted_at IS NULL
    RETURNING user_id
  `)
  return rows.length > 0
}

export async function markEngagementEmailSent(
  userId: string,
  emailType: EngagementEmailType,
): Promise<boolean> {
  const { rows } = await write(sql`/* markEngagementEmailSent */
    UPDATE user_engagement_email_sends
    SET sent_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
      AND email_type = ${emailType}
      AND sent_at IS NULL
      AND delivery_attempted_at IS NOT NULL
    RETURNING user_id
  `)
  return rows.length > 0
}

export async function releaseUnsentEngagementEmailClaim(
  userId: string,
  emailType: EngagementEmailType,
): Promise<boolean> {
  const { rows } = await write(sql`/* releaseUnsentEngagementEmailClaim */
    DELETE FROM user_engagement_email_sends
    WHERE user_id = ${userId}
      AND email_type = ${emailType}
      AND sent_at IS NULL
    RETURNING user_id
  `)
  return rows.length > 0
}

export async function hasEngagementEmailSent(
  userId: string,
  emailType: EngagementEmailType,
): Promise<boolean> {
  const { rows } = await read(sql`/* hasEngagementEmailSent */
    SELECT 1
    FROM user_engagement_email_sends
    WHERE user_id = ${userId}
      AND email_type = ${emailType}
      AND sent_at IS NOT NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function isEngagementEmailsEnabled(userId: string): Promise<boolean> {
  const { rows } = await read<{ engagement_emails_enabled: boolean }>(
    sql`/* isEngagementEmailsEnabled */
      SELECT engagement_emails_enabled
      FROM view_users_private
      WHERE id = ${userId}
        AND processing_restricted_at IS NULL
        AND suspended_at IS NULL
      LIMIT 1
    `,
  )
  return rows[0]?.engagement_emails_enabled === true
}

export async function isFollowTopicsEmailStillEligible(userId: string): Promise<boolean> {
  const { rows } = await read(sql`/* isFollowTopicsEmailStillEligible */
    SELECT 1
    WHERE NOT EXISTS (
      SELECT 1
      FROM relation__user__follow__topic r
      WHERE r.subject_id = ${userId}
        AND r.deleted_at IS NULL
    )
  `)
  return rows.length > 0
}

export async function isPostReferralLinkEmailStillEligible(userId: string): Promise<boolean> {
  const { rows } = await read(sql`/* isPostReferralLinkEmailStillEligible */
    SELECT 1
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_referral_program_links urpl
      WHERE urpl.user_id = ${userId}
        AND urpl.deleted_at IS NULL
        AND urpl.activated_at IS NOT NULL
    )
  `)
  return rows.length > 0
}

export async function isFollowNewsSourcesEmailStillEligible(userId: string): Promise<boolean> {
  const { rows } = await read(sql`/* isFollowNewsSourcesEmailStillEligible */
    SELECT 1
    WHERE NOT EXISTS (
      SELECT 1
      FROM relation__user__follow__rss_feed r
      WHERE r.subject_id = ${userId}
        AND r.deleted_at IS NULL
    )
  `)
  return rows.length > 0
}
