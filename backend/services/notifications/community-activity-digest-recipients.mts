import { getNotificationsWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function listCommunityActivityDigestRecipientPage(
  afterUserId?: string,
  throughUserId?: string,
  userIds?: readonly string[],
  batchSize = getNotificationsWorkLimit('community_digest_recipient_batch_size'),
) {
  const query = sql`/* listCommunityActivityDigestRecipients */
    SELECT u.id AS user_id
    FROM users u
    WHERE u.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = u.id AND suspension.lifted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM community_members cm
        INNER JOIN communities c ON c.id = cm.community_id
        WHERE cm.user_id = u.id
          AND cm.removed_at IS NULL
          AND cm.role IN ('owner', 'moderator')
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
      )
  `
  if (userIds) query.append(sql` AND u.id = ANY(${userIds}::uuid[])`)
  if (afterUserId) query.append(sql` AND u.id > ${afterUserId}`)
  if (throughUserId) query.append(sql` AND u.id <= ${throughUserId}`)
  query.append(sql` ORDER BY u.id ASC LIMIT ${batchSize + 1}`)
  const { rows } = await read<{ user_id: string }>(query)
  const hasMore = rows.length > batchSize
  const page = rows.slice(0, batchSize)
  return {
    page,
    hasMore,
    nextUserId: hasMore ? (page.at(-1)?.user_id ?? null) : null,
  }
}
