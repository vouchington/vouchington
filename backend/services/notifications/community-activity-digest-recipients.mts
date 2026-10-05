import { getNotificationsWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function listCommunityActivityDigestRecipientPage(afterUserId?: string) {
  const COMMUNITY_ACTIVITY_DIGEST_RECIPIENT_BATCH_SIZE = getNotificationsWorkLimit(
    'community_digest_recipient_batch_size',
  )
  const query = sql`/* listCommunityActivityDigestRecipients */
    SELECT DISTINCT cm.user_id
    FROM community_members cm
    JOIN communities c ON c.id = cm.community_id
    JOIN users u ON u.id = cm.user_id
    WHERE cm.removed_at IS NULL
      AND cm.role IN ('owner', 'moderator')
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND u.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions us
        WHERE us.user_id = cm.user_id AND us.lifted_at IS NULL
      )
  `
  if (afterUserId) query.append(sql` AND cm.user_id > ${afterUserId}`)
  query.append(
    sql` ORDER BY cm.user_id LIMIT ${COMMUNITY_ACTIVITY_DIGEST_RECIPIENT_BATCH_SIZE + 1}`,
  )
  const { rows } = await read<{ user_id: string }>(query)
  return {
    rows,
    page: rows.slice(0, COMMUNITY_ACTIVITY_DIGEST_RECIPIENT_BATCH_SIZE),
  }
}
