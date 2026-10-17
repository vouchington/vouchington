import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

/** Make the existing seeded community moderator eligible at the pinned scenario time. */
export async function seedModerationSummaryRecipient(): Promise<void> {
  const userId = seedUuid(1, '01')
  const communityId = seedUuid(0, '14')
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(
    `/* seedExplainData */ UPDATE users u
     SET is_moderation_emails_enabled = TRUE,
       moderation_email_cadence = 'daily',
       moderation_email_time_of_day = '00:00',
       moderation_email_timezone = 'UTC'
     WHERE u.id = $1
       AND EXISTS (
         SELECT 1
         FROM community_members cm
         JOIN communities c ON c.id = cm.community_id
         WHERE cm.user_id = u.id
           AND cm.community_id = $2
           AND cm.role = 'moderator'
           AND cm.removed_at IS NULL
           AND c.deleted_at IS NULL
           AND c.archived_at IS NULL
       )
       AND EXISTS (
         SELECT 1 FROM user_email_addresses email
         WHERE email.user_id = u.id AND email.is_primary = TRUE
       )
     RETURNING u.id`,
    [userId, communityId],
  )
  if (rows.length !== 1) {
    throw new Error(
      'Moderation summary seed requires an active seeded moderator with a primary email',
    )
  }
  await transaction.commit()
}
