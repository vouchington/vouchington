import { getCommunitiesWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationRecipientRow } from './moderation-summary-schedule.mts'

export async function getModerationSummaryRecipients(now: Date): Promise<ModerationRecipientRow[]> {
  const WORK_PAGE_SIZE = getCommunitiesWorkLimit('summary_email_batch_size')
  const { rows } = await read(sql`/* getModerationSummaryRecipients */
    SELECT
      u.id,
      (SELECT email.email_address FROM user_email_addresses email
       WHERE email.user_id = u.id AND email.is_primary = TRUE) AS email_address,
      u.username,
      u.ui_locale,
      u.moderation_email_cadence,
      u.moderation_email_days_of_week,
      u.moderation_email_time_of_day,
      COALESCE(u.moderation_email_timezone, 'America/Los_Angeles') AS moderation_email_timezone
    -- Stream unique moderator identities in user order; all recipient filters precede LIMIT.
    FROM (
      SELECT DISTINCT cm.user_id
      FROM community_members cm
      WHERE cm.removed_at IS NULL
        AND cm.role IN ('owner', 'moderator')
      ORDER BY cm.user_id
    ) moderator_users
    JOIN users u ON u.id = moderator_users.user_id
    CROSS JOIN LATERAL (
      SELECT
        ${now}::timestamptz AT TIME ZONE COALESCE(
          u.moderation_email_timezone,
          'America/Los_Angeles'
        ) AS local_now
    ) moderation_email_schedule
    WHERE u.deleted_at IS NULL
      AND (SELECT email.email_address FROM user_email_addresses email
           WHERE email.user_id = u.id AND email.is_primary = TRUE) IS NOT NULL
      AND u.is_moderation_emails_enabled = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = u.id AND suspension.lifted_at IS NULL
      )
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
      AND EXISTS (
        SELECT 1 FROM community_members cm
        INNER JOIN communities c ON c.id = cm.community_id
        WHERE cm.user_id = u.id
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND cm.removed_at IS NULL
          AND cm.role IN ('owner', 'moderator')
          AND (
            NOT cm.should_suppress_community_digests_while_on_vacation
            OR NOT EXISTS (
              SELECT 1
              FROM community_member_vacations v
              WHERE v.community_id = cm.community_id
                AND v.user_id = cm.user_id
                AND v.starts_at <= ${now}::timestamptz
                AND (v.ends_at IS NULL OR v.ends_at > ${now}::timestamptz)
            )
          )
          AND (
            EXISTS (
              SELECT 1
              FROM community_post_reviews cpr
              INNER JOIN posts rp ON rp.id = cpr.post_id AND rp.deleted_at IS NULL
              WHERE cpr.community_id = c.id
                AND cpr.approved_at IS NULL
                AND cpr.rejected_at IS NULL
                -- Pending is the same set as searchPendingPosts, which is what idx_comm_post_reviews__pending covers.
                AND cpr.unpublished_at IS NULL
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
              FROM posts p
              JOIN LATERAL (
                SELECT 1 FROM moderation_reports mr
                WHERE mr.post_id = p.id AND mr.reviewed_at IS NULL
                LIMIT 1
              ) pending_report ON TRUE
              WHERE p.community_id = c.id
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
    LIMIT ${WORK_PAGE_SIZE}
  `)
  return rows as ModerationRecipientRow[]
}
