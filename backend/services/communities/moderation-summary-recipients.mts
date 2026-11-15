import { getCommunitiesWorkLimit } from './work-limits.mts'
import { decodeUuidCursor, encodeCursor, hasExactKeys } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationRecipientRow } from './moderation-summary-schedule.mts'

// Scalar point bounds keep profile reads keyed instead of merging unrelated users.
/** Every inspected membership advances the cursor, including duplicate or ineligible users. */
export async function getModerationSummaryRecipients(
  afterId?: string,
): Promise<{ recipients: ModerationRecipientRow[]; afterId?: string }> {
  const after = afterId
    ? decodeUuidCursor(afterId, isMembershipCursor, 'Invalid moderation membership cursor')
    : undefined
  const limit = getCommunitiesWorkLimit('summary_email_batch_size')
  const { rows } = await read<
    ModerationRecipientRow & { community_id: string; is_eligible: boolean }
  >(sql`/* getModerationSummaryRecipients */
    SELECT cm.user_id AS id, cm.community_id,
      (SELECT email.email_address FROM user_email_addresses email
       WHERE email.user_id = u.id AND email.is_primary = TRUE) AS email_address,
      u.username, u.ui_locale, u.moderation_email_cadence,
      u.moderation_email_days_of_week, u.moderation_email_time_of_day,
      COALESCE(u.moderation_email_timezone, 'America/Los_Angeles') AS moderation_email_timezone,
      COALESCE((u.deleted_at IS NULL AND u.is_moderation_emails_enabled
       AND (SELECT TRUE FROM user_email_addresses email WHERE email.user_id = u.id AND email.is_primary LIMIT 1) IS TRUE
       AND (SELECT TRUE FROM user_suspensions suspension WHERE suspension.user_id = u.id AND suspension.lifted_at IS NULL LIMIT 1) IS NOT TRUE
), FALSE) AS is_eligible
    FROM community_members cm
    LEFT JOIN users u ON u.id BETWEEN (SELECT cm.user_id LIMIT 1) AND (SELECT cm.user_id LIMIT 1)
    WHERE cm.removed_at IS NULL AND cm.role IN ('owner', 'moderator')
      AND (cm.user_id, cm.community_id) > (
        COALESCE(${after?.id ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(${after?.communityId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    ORDER BY cm.user_id, cm.community_id
    LIMIT ${limit}
  `)
  const seen = new Set<string>()
  const recipients = rows.filter(row => {
    if (!row.is_eligible || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
  const last = rows.at(-1)
  return {
    recipients,
    ...(rows.length === limit && last
      ? { afterId: encodeCursor({ id: last.id, communityId: last.community_id }) }
      : {}),
  }
}

function isMembershipCursor(value: unknown): value is { id: string; communityId: string } {
  return (
    hasExactKeys(value, ['id', 'communityId']) &&
    typeof value.id === 'string' &&
    typeof value.communityId === 'string' &&
    isUUID(value.communityId)
  )
}
