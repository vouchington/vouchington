import { getNotificationsWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function listCommunityActivityDigestRecipientPage(
  afterUserId?: string,
  throughUserId?: string,
  userIds?: readonly string[],
  batchSize = getNotificationsWorkLimit('community_digest_recipient_batch_size'),
) {
  const moderators = sql`
    SELECT DISTINCT cm.user_id
    FROM community_members cm
    WHERE cm.removed_at IS NULL AND cm.role IN ('owner', 'moderator')
      AND (SELECT c.deleted_at IS NULL AND c.archived_at IS NULL
           FROM communities c WHERE c.id = cm.community_id) IS TRUE
  `
  if (userIds) moderators.append(sql` AND cm.user_id = ANY(${userIds}::uuid[])`)
  if (afterUserId) moderators.append(sql` AND cm.user_id > ${afterUserId}`)
  if (throughUserId) moderators.append(sql` AND cm.user_id <= ${throughUserId}`)
  moderators.append(sql` ORDER BY cm.user_id`)
  const query = sql`/* listCommunityActivityDigestRecipients */
    SELECT moderator.user_id
    FROM (`.append(moderators).append(sql`) moderator
    WHERE (SELECT u.deleted_at IS NULL FROM users u WHERE u.id = moderator.user_id) IS TRUE
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = moderator.user_id AND suspension.lifted_at IS NULL
      )
  `)
  query.append(sql` ORDER BY moderator.user_id ASC LIMIT ${batchSize + 1}`)
  const { rows } = await read<{ user_id: string }>(query)
  const hasMore = rows.length > batchSize
  const page = rows.slice(0, batchSize)
  return {
    page,
    hasMore,
    nextUserId: hasMore ? (page.at(-1)?.user_id ?? null) : null,
  }
}
