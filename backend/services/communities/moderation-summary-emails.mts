/* oxlint-disable max-lines -- Local date/time formatters are cached by timezone. */
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMarketingPostalAddress, getSiteUrl } from '@modules/utils'
import onError from '@modules/on-error'
import { enqueueSendCommunityModerationSummaryEmail } from '@queues/emails/enqueues'
import { timestampToUuidv7LowerBound } from '@data-stores/psql/config-driven/utils/partition-utils'
import { createEmailUnsubscribeUrl } from '@services/users'
import type { CommunityModerationSummaryEmailProps } from '@email-templates/core'
import pMap from 'p-map'

export type ModerationRecipientRow = {
  id: string
  email_address: string
  username: string | null
  ui_locale: string | null
  moderation_email_cadence: 'daily' | 'selected_days' | 'weekly'
  moderation_email_days_of_week: number[]
  moderation_email_time_of_day: string
  moderation_email_timezone: string
}

export async function dispatchCommunityModerationSummaryEmails(): Promise<void> {
  const recipients = await getModerationSummaryRecipients()
  const now = new Date()
  await pMap(recipients, recipient => dispatchModerationSummary(recipient, now), {
    concurrency: 1,
    stopOnError: false,
  })
}

async function dispatchModerationSummary(
  recipient: ModerationRecipientRow,
  now: Date,
): Promise<void> {
  let sendKey: string | null = null
  try {
    if (!isModerationEmailDue(recipient, now)) return

    const windowStart = getModerationActivityWindowStart(recipient.moderation_email_cadence, now)
    const communities = await getCommunityModerationSummaryCommunities(
      recipient.id,
      windowStart,
      now,
    )
    if (communities.length === 0) return

    sendKey = buildModerationSendKey(recipient, now)
    if (!(await claimModerationEmailSend(recipient.id, sendKey))) return

    const props: CommunityModerationSummaryEmailProps = {
      userName: recipient.username ?? undefined,
      generatedForDate: formatLocalDate(now, recipient.moderation_email_timezone),
      settingsUrl: getSiteUrl('/my/notification-settings'),
      unsubscribeUrl: createEmailUnsubscribeUrl(recipient.id, 'community_digest'),
      physicalAddress: getMarketingPostalAddress(),
      communities,
    }
    await enqueueSendCommunityModerationSummaryEmail(
      {
        userId: recipient.id,
        trackingKey: sendKey,
        windowStart: windowStart.toISOString(),
        windowEnd: now.toISOString(),
        uiLocale: recipient.ui_locale ?? null,
      },
      props,
    )
  } catch (error) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient enqueue failures. */
    if (sendKey) await releaseModerationClaim(recipient.id, sendKey)
    reportModerationDispatchError(error, recipient.id)
    /* c8 ignore stop */
  }
}

/* c8 ignore start -- Only called from defensive moderation dispatch cleanup paths. */
async function releaseModerationClaim(userId: string, sendKey: string): Promise<void> {
  try {
    await releaseUnsentModerationEmailClaim(userId, sendKey)
  } catch (error) {
    reportModerationDispatchError(error, userId)
  }
}

function reportModerationDispatchError(error: unknown, userId: string): void {
  const reportableError = error instanceof Error ? error : new Error(String(error))
  Object.assign(reportableError, {
    tags: { worker: 'moderation-summary-email-dispatch' },
    extra: { userId },
  })
  onError(reportableError)
}
/* c8 ignore stop */

export async function isModerationEmailsEnabled(userId: string): Promise<boolean> {
  const { rows } = await read<{ moderation_emails_enabled: boolean }>(
    sql`/* isModerationEmailsEnabled */
      SELECT moderation_emails_enabled
      FROM users
      WHERE id = ${userId}
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_suspensions us WHERE us.user_id = users.id AND us.lifted_at IS NULL
        )
      LIMIT 1
    `,
  )
  return rows[0]?.moderation_emails_enabled === true
}

export async function getModerationEmailTimezone(userId: string): Promise<string> {
  const { rows } = await read<{ moderation_email_timezone: string }>(
    sql`/* getModerationEmailTimezone */
      SELECT COALESCE(moderation_email_timezone, 'America/Los_Angeles') AS moderation_email_timezone
      FROM view_users_private
      WHERE id = ${userId}
      LIMIT 1
    `,
  )
  return rows[0]?.moderation_email_timezone ?? 'America/Los_Angeles'
}

export async function getModerationEmailCadence(
  userId: string,
): Promise<ModerationRecipientRow['moderation_email_cadence']> {
  const { rows } = await read<{
    moderation_email_cadence: ModerationRecipientRow['moderation_email_cadence']
  }>(
    sql`/* getModerationEmailCadence */
      SELECT COALESCE(moderation_email_cadence, 'weekly') AS moderation_email_cadence
      FROM view_users_private
      WHERE id = ${userId}
      LIMIT 1
    `,
  )
  return rows[0]?.moderation_email_cadence ?? 'weekly'
}

/**
 * Coverage window for the activity digest fields, derived from the recipient's send cadence:
 * `daily` covers the last 24 hours; `weekly` and `selected_days` both cover the last 7 days
 * (day-of-week selection controls which days a send can happen, not the coverage period).
 */
export function getModerationActivityWindowStart(
  cadence: ModerationRecipientRow['moderation_email_cadence'],
  now: Date,
): Date {
  const hours = cadence === 'daily' ? 24 : 24 * 7
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

export async function claimModerationEmailSend(userId: string, sendKey: string): Promise<boolean> {
  const { rows } = await write(sql`/* claimModerationEmailSend */
    INSERT INTO user_moderation_email_sends (user_id, send_key)
    VALUES (${userId}, ${sendKey})
    ON CONFLICT DO NOTHING
    RETURNING user_id
  `)
  return rows.length > 0
}

export async function markModerationEmailSent(userId: string, sendKey: string): Promise<boolean> {
  const { rows } = await write(sql`/* markModerationEmailSent */
    UPDATE user_moderation_email_sends
    SET sent_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
      AND send_key = ${sendKey}
      AND sent_at IS NULL
    RETURNING user_id
  `)
  return rows.length > 0
}

export async function releaseUnsentModerationEmailClaim(
  userId: string,
  sendKey: string,
): Promise<boolean> {
  const { rows } = await write(sql`/* releaseUnsentModerationEmailClaim */
    DELETE FROM user_moderation_email_sends
    WHERE user_id = ${userId}
      AND send_key = ${sendKey}
      AND sent_at IS NULL
    RETURNING user_id
  `)
  return rows.length > 0
}

export async function hasModerationEmailSent(userId: string, sendKey: string): Promise<boolean> {
  const { rows } = await read(sql`/* hasModerationEmailSent */
    SELECT 1
    FROM user_moderation_email_sends
    WHERE user_id = ${userId}
      AND send_key = ${sendKey}
      AND sent_at IS NOT NULL
    LIMIT 1
  `)
  return rows.length > 0
}

async function getModerationSummaryRecipients(): Promise<ModerationRecipientRow[]> {
  const { rows } = await read(sql`/* getModerationSummaryRecipients */
    SELECT DISTINCT
      u.id,
      u.email_address,
      u.username,
      u.ui_locale,
      u.moderation_email_cadence,
      u.moderation_email_days_of_week,
      u.moderation_email_time_of_day,
      COALESCE(u.moderation_email_timezone, 'America/Los_Angeles') AS moderation_email_timezone
    FROM view_users_private u
    JOIN community_members cm
      ON cm.user_id = u.id
      AND cm.removed_at IS NULL
      AND cm.role IN ('owner', 'moderator')
      AND (
        NOT cm.suppress_community_digests_while_on_vacation
        OR NOT EXISTS (
        SELECT 1
        FROM community_member_vacations v
        WHERE v.community_id = cm.community_id
          AND v.user_id = cm.user_id
          AND v.starts_at <= now()
          AND (v.ends_at IS NULL OR v.ends_at > now())
        )
      )
    JOIN communities c
      ON c.id = cm.community_id
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
    CROSS JOIN LATERAL (
      SELECT
        CURRENT_TIMESTAMP AT TIME ZONE COALESCE(
          u.moderation_email_timezone,
          'America/Los_Angeles'
        ) AS local_now
    ) moderation_email_schedule
    WHERE u.email_address IS NOT NULL
      AND u.moderation_emails_enabled = TRUE
      AND u.suspended_at IS NULL
      AND u.moderation_email_time_of_day <=
        to_char(moderation_email_schedule.local_now, 'HH24:MI')
      AND (
        u.moderation_email_cadence = 'daily'
        OR (
          u.moderation_email_cadence = 'selected_days'
          AND u.moderation_email_days_of_week @> ARRAY[
            EXTRACT(ISODOW FROM moderation_email_schedule.local_now)::SMALLINT
          ]::SMALLINT[]
        )
        OR (
          u.moderation_email_cadence = 'weekly'
          AND EXTRACT(ISODOW FROM moderation_email_schedule.local_now)::SMALLINT = (
            SELECT MIN(day)
            FROM unnest(u.moderation_email_days_of_week) AS days(day)
          )
        )
      )
      AND (
        EXISTS (
          SELECT 1
          FROM community_post_reviews cpr
          INNER JOIN posts rp
            ON rp.id = cpr.post_id
            AND rp.deleted_at IS NULL
          WHERE cpr.community_id = c.id
            AND cpr.approved_at IS NULL
            AND cpr.rejected_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM community_applications ca
          WHERE ca.community_id = c.id
            AND ca.approved_at IS NULL
            AND ca.rejected_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM moderation_reports mr
          INNER JOIN posts p ON p.id = mr.post_id
          WHERE p.community_id = c.id
            AND mr.reviewed_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM community_members cm2
          WHERE cm2.community_id = c.id
            AND cm2.removed_at IS NULL
            AND cm2.suspected_ban_evader_at IS NOT NULL
            AND cm2.suspected_ban_evader_dismissed_at IS NULL
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_moderation_email_sends s
        WHERE s.user_id = u.id
          AND s.send_key = CASE
            WHEN u.moderation_email_cadence = 'weekly'
              THEN 'weekly:' || to_char(moderation_email_schedule.local_now, 'IYYY-"W"IW')
            ELSE 'daily:' || to_char(moderation_email_schedule.local_now, 'YYYY-MM-DD')
          END
      )
    ORDER BY u.id ASC
    LIMIT 250
  `)
  return rows as ModerationRecipientRow[]
}

export async function getCommunityModerationSummaryCommunities(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<CommunityModerationSummaryEmailProps['communities']> {
  const windowStartId = timestampToUuidv7LowerBound(windowStart.getTime())
  const windowEndId = timestampToUuidv7LowerBound(windowEnd.getTime())
  const { rows } = await read(sql`/* getCommunityModerationSummaryCommunities */
    SELECT
      c.name,
      c.slug,
      c.id,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_post_reviews cpr
        INNER JOIN posts rp
          ON rp.id = cpr.post_id
          AND rp.deleted_at IS NULL
        WHERE cpr.community_id = c.id
          AND cpr.approved_at IS NULL
          AND cpr.rejected_at IS NULL
      ), 0) AS pending_post_reviews,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_applications ca
        WHERE ca.community_id = c.id
          AND ca.approved_at IS NULL
          AND ca.rejected_at IS NULL
      ), 0) AS pending_applications,
      COALESCE((
        SELECT COUNT(*)::int
        FROM moderation_reports mr
        INNER JOIN posts p ON p.id = mr.post_id
        WHERE p.community_id = c.id
          AND mr.reviewed_at IS NULL
      ), 0) AS pending_reports,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_post_reviews cpr
        INNER JOIN posts rp
          ON rp.id = cpr.post_id
          AND rp.deleted_at IS NULL
        WHERE cpr.community_id = c.id
          AND cpr.approved_at IS NULL
          AND cpr.rejected_at IS NULL
          AND cpr.escalated_at IS NOT NULL
      ), 0) + COALESCE((
        SELECT COUNT(*)::int
        FROM moderation_reports mr
        INNER JOIN posts p ON p.id = mr.post_id
        LEFT JOIN LATERAL (
          SELECT mj.recommended_action
          FROM moderation_report_judgements mj
          WHERE mj.post_id IS NOT DISTINCT FROM mr.post_id
            AND mj.reported_user_id IS NOT DISTINCT FROM mr.reported_user_id
            AND mj.hostname_id IS NOT DISTINCT FROM mr.hostname_id
            AND mj.rss_feed_item_id IS NOT DISTINCT FROM mr.rss_feed_item_id
          ORDER BY mj.id DESC
          LIMIT 1
        ) latest_judgement ON TRUE
        WHERE p.community_id = c.id
          AND mr.reviewed_at IS NULL
          AND (
            mr.escalated_at IS NOT NULL
            OR latest_judgement.recommended_action = 'escalate'
          )
      ), 0) AS escalated_items,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_members cm2
        WHERE cm2.community_id = c.id
          AND cm2.removed_at IS NULL
          AND cm2.suspected_ban_evader_at IS NOT NULL
          AND cm2.suspected_ban_evader_dismissed_at IS NULL
      ), 0) AS suspected_ban_evaders,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_members joined_members
        INNER JOIN users joined_member_user
          ON joined_member_user.id = joined_members.user_id
          AND joined_member_user.deleted_at IS NULL
        WHERE joined_members.community_id = c.id
          AND joined_members.id >= ${windowStartId}
          AND joined_members.id < ${windowEndId}
      ), 0) AS new_members,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_members departed_members
        WHERE departed_members.community_id = c.id
          AND departed_members.removed_at >= ${windowStart}
          AND departed_members.removed_at < ${windowEnd}
      ), 0) AS departed_members,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_members active_members
        INNER JOIN users active_member_user
          ON active_member_user.id = active_members.user_id
          AND active_member_user.deleted_at IS NULL
        WHERE active_members.community_id = c.id
          AND active_members.removed_at IS NULL
      ), 0) AS total_active_members,
      COALESCE((
        SELECT COUNT(*)::int
        FROM posts np
        WHERE np.community_id = c.id
          AND np.post_type = 'discussion'
          AND np.id >= ${windowStartId}
          AND np.id < ${windowEndId}
          AND np.deleted_at IS NULL
      ), 0) AS new_discussion_posts,
      COALESCE((
        SELECT COUNT(*)::int
        FROM posts np
        WHERE np.community_id = c.id
          AND np.post_type = 'review'
          AND np.id >= ${windowStartId}
          AND np.id < ${windowEndId}
          AND np.deleted_at IS NULL
      ), 0) AS new_review_posts,
      COALESCE((
        SELECT COUNT(*)::int
        FROM posts np
        WHERE np.community_id = c.id
          AND np.post_type = 'data_point'
          AND np.id >= ${windowStartId}
          AND np.id < ${windowEndId}
          AND np.deleted_at IS NULL
      ), 0) AS new_data_point_posts,
      top_discussion.title AS top_discussion_title,
      top_discussion.reply_count AS top_discussion_reply_count,
      COALESCE((
        SELECT COUNT(DISTINCT engaged_members.user_id)::int
        FROM community_members engaged_members
        WHERE engaged_members.community_id = c.id
          AND engaged_members.removed_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM posts engagement_post
            WHERE engagement_post.created_by_id = engaged_members.user_id
              AND engagement_post.community_id = c.id
              AND engagement_post.id >= ${windowStartId}
              AND engagement_post.id < ${windowEndId}
              AND engagement_post.deleted_at IS NULL
          )
      ), 0) AS active_member_count
    FROM community_members cm
    INNER JOIN communities c
      ON c.id = cm.community_id
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
    LEFT JOIN LATERAL (
      SELECT
        top_post.title,
        COUNT(reply.id)::int AS reply_count
      FROM posts top_post
      LEFT JOIN posts reply
        ON reply.parent_id = top_post.id
        AND reply.post_type = 'comment'
        AND reply.id > top_post.id
        AND reply.id < ${windowEndId}
        AND reply.deleted_at IS NULL
      WHERE top_post.community_id = c.id
        AND top_post.post_type = 'discussion'
        AND top_post.id >= ${windowStartId}
        AND top_post.id < ${windowEndId}
        AND top_post.deleted_at IS NULL
      GROUP BY top_post.id, top_post.title
      ORDER BY reply_count DESC, top_post.id ASC
      LIMIT 1
    ) top_discussion ON TRUE
    WHERE cm.user_id = ${userId}
      AND cm.removed_at IS NULL
      AND cm.role IN ('owner', 'moderator')
      AND (
        NOT cm.suppress_community_digests_while_on_vacation
        OR NOT EXISTS (
        SELECT 1
        FROM community_member_vacations v
        WHERE v.community_id = cm.community_id
          AND v.user_id = cm.user_id
          AND v.starts_at <= now()
          AND (v.ends_at IS NULL OR v.ends_at > now())
        )
      )
    ORDER BY c.name ASC, c.id ASC
  `)

  const communities: CommunityModerationSummaryEmailProps['communities'] = []
  for (const row of rows) {
    const totalActiveMembers = row.total_active_members as number
    const activeMemberCount = row.active_member_count as number
    const community = {
      name: row.name as string,
      url: getSiteUrl(`/communities/${row.slug as string}`),
      pendingPostReviews: row.pending_post_reviews as number,
      pendingApplications: row.pending_applications as number,
      pendingReports: row.pending_reports as number,
      escalatedItems: row.escalated_items as number,
      suspectedBanEvaders: row.suspected_ban_evaders as number,
      netMemberChange: (row.new_members as number) - (row.departed_members as number),
      totalActiveMembers,
      newDiscussionPosts: row.new_discussion_posts as number,
      newReviewPosts: row.new_review_posts as number,
      newDataPointPosts: row.new_data_point_posts as number,
      topDiscussionTitle: (row.top_discussion_title as string | null) ?? null,
      topDiscussionReplyCount: (row.top_discussion_reply_count as number | null) ?? 0,
      activeMemberCount,
      activeMemberRate: totalActiveMembers > 0 ? activeMemberCount / totalActiveMembers : 0,
    }
    if (hasModerationSummaryWork(community)) communities.push(community)
  }
  return communities
}

function hasModerationSummaryWork(
  community: CommunityModerationSummaryEmailProps['communities'][number],
): boolean {
  return (
    community.pendingPostReviews > 0 ||
    community.pendingApplications > 0 ||
    community.pendingReports > 0 ||
    community.escalatedItems > 0 ||
    community.suspectedBanEvaders > 0
  )
}

export function isModerationEmailDue(recipient: ModerationRecipientRow, now: Date): boolean {
  if (
    timeToMinutes(formatLocalTime(now, recipient.moderation_email_timezone)) <
    timeToMinutes(recipient.moderation_email_time_of_day)
  ) {
    return false
  }

  const isoDayOfWeek = getIsoDayOfWeekForLocalDate(
    formatLocalDate(now, recipient.moderation_email_timezone),
  )
  if (recipient.moderation_email_cadence === 'daily') return true
  if (recipient.moderation_email_cadence === 'weekly') {
    return isoDayOfWeek === Math.min(...recipient.moderation_email_days_of_week)
  }

  return recipient.moderation_email_days_of_week.includes(isoDayOfWeek)
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function buildModerationSendKey(recipient: ModerationRecipientRow, now: Date): string {
  const localDate = formatLocalDate(now, recipient.moderation_email_timezone)
  if (recipient.moderation_email_cadence === 'weekly') {
    return `weekly:${getIsoWeekKey(localDate)}`
  }
  return `daily:${localDate}`
}

export function formatLocalDate(now: Date, timeZone: string): string {
  return getLocalDateFormatter(timeZone).format(now)
}

export function formatLocalTime(now: Date, timeZone: string): string {
  return getLocalTimeFormatter(timeZone).format(now)
}

const localDateFormatters = new Map<string, Intl.DateTimeFormat>()
const localTimeFormatters = new Map<string, Intl.DateTimeFormat>()

function getLocalDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = localDateFormatters.get(timeZone)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  localDateFormatters.set(timeZone, formatter)
  return formatter
}

function getLocalTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = localTimeFormatters.get(timeZone)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  localTimeFormatters.set(timeZone, formatter)
  return formatter
}

function getIsoDayOfWeekForLocalDate(localDate: string): number {
  const date = new Date(`${localDate}T00:00:00.000Z`)
  const day = date.getUTCDay()
  return day === 0 ? 7 : day
}

function getIsoWeekKey(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00.000Z`)
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNumber = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}
