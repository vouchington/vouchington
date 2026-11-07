import { getUsersWorkLimit } from '@services/users/work-limits'
import { getEngagementEmailsWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type EngagementRecipientRow = {
  id: string
  email_address: string
  username: string | null
  ui_locale: string | null
}

type EngagementRecipientEmailType = 'follow_topics' | 'post_referral_link' | 'follow_news_sources'

function engagementEmailTypeLiteral(emailType: EngagementRecipientEmailType) {
  if (emailType === 'follow_topics') return sql`'follow_topics'`
  if (emailType === 'post_referral_link') return sql`'post_referral_link'`
  return sql`'follow_news_sources'`
}

async function readEngagementRecipients(
  label: string,
  emailType: EngagementRecipientEmailType,
  userIds: readonly string[] | undefined,
  eligibility: ReturnType<typeof sql>,
): Promise<EngagementRecipientRow[]> {
  const claimHours = getUsersWorkLimit('engagement_claim_hours')
  const pageSize = getEngagementEmailsWorkLimit('dispatch_batch_size')
  const query = sql`/* `.append(label).append(sql` */
    SELECT u.id, uea.email_address, u.username, u.ui_locale
    FROM users u
    JOIN user_email_addresses uea
      ON uea.user_id = u.id
      AND uea.is_primary = TRUE
    WHERE u.deleted_at IS NULL
      AND u.is_engagement_emails_enabled = TRUE
      AND u.processing_restricted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions us WHERE us.user_id = u.id AND us.lifted_at IS NULL
      )
      AND `)
  query.append(eligibility)
  query
    .append(
      sql`
      AND NOT EXISTS (
        SELECT 1
        FROM user_engagement_email_sends s
        WHERE s.user_id = u.id
          AND s.email_type = `,
    )
    .append(engagementEmailTypeLiteral(emailType))
    .append(
      sql`
          AND (
            s.sent_at IS NOT NULL
            OR s.delivery_attempted_at IS NOT NULL
            OR s.claimed_at >= CURRENT_TIMESTAMP - ${claimHours}::integer * INTERVAL '1 hour'
          )
      )
    `,
    )
  // A null array is not a filter. Binding `$1 IS NULL OR id = ANY($2)` makes a generic
  // plan treat the page as selective, then coin-flip the follow-table join.
  if (userIds !== undefined) query.append(sql` AND u.id = ANY(${userIds}::uuid[])`)
  query
    .append(
      sql` ORDER BY (
      SELECT s.claimed_at
      FROM user_engagement_email_sends s
      WHERE s.user_id = u.id AND s.email_type = `,
    )
    .append(engagementEmailTypeLiteral(emailType)).append(sql` ) ASC NULLS FIRST, u.id ASC
    LIMIT ${pageSize}`)
  const { rows } = await read(query)
  return rows as EngagementRecipientRow[]
}

export async function getFollowTopicsRecipients(
  userIds?: readonly string[],
): Promise<EngagementRecipientRow[]> {
  return readEngagementRecipients(
    'getFollowTopicsRecipients',
    'follow_topics',
    userIds,
    sql`NOT EXISTS (
      SELECT 1
      FROM relation__user__follow__topic r
      WHERE r.subject_id = u.id
        AND r.deleted_at IS NULL
    )`,
  )
}

export async function getPostReferralLinkRecipients(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
): Promise<EngagementRecipientRow[]> {
  return readEngagementRecipients(
    'getPostReferralLinkRecipients',
    'post_referral_link',
    userIds,
    sql`NOT EXISTS (
      SELECT 1
      FROM user_referral_program_links urpl
      WHERE urpl.user_id = u.id
        AND urpl.deleted_at IS NULL
        AND urpl.activated_at IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM user_engagement_email_sends s
      WHERE s.user_id = u.id
        AND s.email_type = 'follow_topics'
        AND s.claimed_at >= ${dispatchStartedAt}
    )`,
  )
}

export async function getFollowNewsSourcesRecipients(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
): Promise<EngagementRecipientRow[]> {
  return readEngagementRecipients(
    'getFollowNewsSourcesRecipients',
    'follow_news_sources',
    userIds,
    sql`NOT EXISTS (
      SELECT 1
      FROM relation__user__follow__rss_feed r
      WHERE r.subject_id = u.id
        AND r.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM user_engagement_email_sends s
      WHERE s.user_id = u.id
        AND s.email_type IN ('follow_topics', 'post_referral_link')
        AND s.claimed_at >= ${dispatchStartedAt}
    )`,
  )
}
