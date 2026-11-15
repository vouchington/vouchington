import { getNotificationsWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function findCommunityActivityDigestThroughUserId(userIds?: readonly string[]) {
  const query = sql`/* findCommunityActivityDigestThroughUserId */
    SELECT user_id FROM community_members
    WHERE removed_at IS NULL AND role IN ('owner', 'moderator')`
  if (userIds) query.append(sql` AND user_id = ANY(${userIds}::uuid[])`)
  query.append(sql` ORDER BY user_id DESC, community_id DESC LIMIT 1`)
  const { rows } = await read<{ user_id: string }>(query)
  return rows[0]?.user_id ?? null
}

/** Inspect one ordered membership page; eligibility never expands or refills it. */
export async function listCommunityActivityDigestRecipientPage(
  afterUserId?: string,
  throughUserId?: string,
  userIds?: readonly string[],
  batchSize = getNotificationsWorkLimit('community_digest_recipient_batch_size'),
  afterCommunityId?: string | null,
) {
  const query = sql`/* listCommunityActivityDigestRecipients */
    SELECT cm.user_id, cm.community_id,
      (SELECT recipient.deleted_at IS NULL FROM users recipient
       WHERE recipient.id = cm.user_id) IS TRUE
      AND (SELECT community.deleted_at IS NULL AND community.archived_at IS NULL
           FROM communities community WHERE community.id = cm.community_id) IS TRUE
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = cm.user_id AND suspension.lifted_at IS NULL
      ) AS eligible
    FROM community_members cm
    WHERE cm.removed_at IS NULL AND cm.role IN ('owner', 'moderator')
  `
  if (userIds) query.append(sql` AND cm.user_id = ANY(${userIds}::uuid[])`)
  if (afterUserId) {
    query.append(
      afterCommunityId
        ? sql` AND (cm.user_id, cm.community_id) > (${afterUserId}::uuid, ${afterCommunityId}::uuid)`
        : sql` AND cm.user_id > ${afterUserId}::uuid`,
    )
  }
  if (throughUserId) query.append(sql` AND cm.user_id <= ${throughUserId}::uuid`)
  query.append(sql` ORDER BY cm.user_id, cm.community_id LIMIT ${batchSize + 1}`)
  const { rows } = await read<{ user_id: string; community_id: string; eligible: boolean }>(query)
  const inspected = rows.slice(0, batchSize)
  const eligibleUsers = new Set(inspected.flatMap(row => (row.eligible ? [row.user_id] : [])))
  const page = [...eligibleUsers].map(user_id => ({ user_id }))
  const hasMore = rows.length > batchSize
  const last = inspected.at(-1)
  return {
    page,
    hasMore,
    nextUserId: hasMore ? (last?.user_id ?? null) : null,
    nextCommunityId: hasMore && last && !eligibleUsers.has(last.user_id) ? last.community_id : null,
  }
}
