import { getCommunitiesWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationRecipientRow } from './moderation-summary-schedule.mts'

/** Every inspected user advances the cursor, including users ineligible for this digest. */
export async function getModerationSummaryRecipients(
  _now: Date,
  afterId?: string,
): Promise<{ recipients: ModerationRecipientRow[]; afterId?: string }> {
  const limit = getCommunitiesWorkLimit('summary_email_batch_size')
  const { rows } = await read<
    ModerationRecipientRow & { is_eligible: boolean }
  >(sql`/* getModerationSummaryRecipients */
    SELECT u.id,
      (SELECT email.email_address FROM user_email_addresses email
       WHERE email.user_id = u.id AND email.is_primary = TRUE) AS email_address,
      u.username, u.ui_locale, u.moderation_email_cadence,
      u.moderation_email_days_of_week, u.moderation_email_time_of_day,
      COALESCE(u.moderation_email_timezone, 'America/Los_Angeles') AS moderation_email_timezone,
      (u.deleted_at IS NULL AND u.is_moderation_emails_enabled
       AND (SELECT TRUE FROM community_members cm WHERE cm.user_id = u.id
            AND cm.removed_at IS NULL AND cm.role IN ('owner', 'moderator') LIMIT 1) IS TRUE
       AND EXISTS (SELECT 1 FROM user_email_addresses email WHERE email.user_id = u.id AND email.is_primary)
       AND NOT EXISTS (SELECT 1 FROM user_suspensions suspension WHERE suspension.user_id = u.id AND suspension.lifted_at IS NULL)
) AS is_eligible
    FROM users u
    WHERE u.id > COALESCE(${afterId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY u.id
    LIMIT ${limit + 1}
  `)
  return {
    recipients: rows.slice(0, limit).filter(row => row.is_eligible),
    ...(rows.length > limit ? { afterId: rows[limit - 1]!.id } : {}),
  }
}
