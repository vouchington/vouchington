import { read, write, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunitySavedReply } from './types.mts'

type RankingCursor = { ranking: number; id: string }

export async function getCommunitySavedReplies(
  communityId: string,
  options?: { after?: RankingCursor; limit?: number },
): Promise<CommunitySavedReply[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100))
  const query = sql`/* getCommunitySavedReplies */
    SELECT id, community_id, title, body, order_index, created_by_id, created_at, updated_at, deleted_at
    FROM community_saved_replies
    WHERE community_id = ${communityId}
      AND deleted_at IS NULL
  `
  if (options?.after) {
    query.append(sql` AND (order_index, id) > (${options.after.ranking}, ${options.after.id})`)
  }
  query.append(sql` ORDER BY order_index ASC, id ASC LIMIT ${limit + 1}`)
  const { rows } = await read(query)
  return rows as CommunitySavedReply[]
}

export async function createSavedReply(
  currentUserId: string,
  communityId: string,
  options: { title: string; body: string },
): Promise<CommunitySavedReply> {
  const { title, body } = options
  await using query = await beginTransaction()
  // Advisory lock serializes concurrent order_index allocation for the same community.
  await query(
    sql`/* createSavedReply:lock */ SELECT pg_advisory_xact_lock(hashtext(${communityId})::bigint)`,
  )
  const { rows } = await query(sql`/* createSavedReply */
    INSERT INTO community_saved_replies (community_id, title, body, order_index, created_by_id)
    VALUES (
      ${communityId}, ${title}, ${body},
      COALESCE((SELECT MAX(order_index) + 1 FROM community_saved_replies WHERE community_id = ${communityId} AND deleted_at IS NULL), 0),
      ${currentUserId}
    )
    RETURNING id, community_id, title, body, order_index, created_by_id, created_at, updated_at, deleted_at
  `)
  const result = rows[0] as CommunitySavedReply
  await query.commit()
  return result
}

export async function deleteSavedReply(
  currentUserId: string,
  communityId: string,
  replyId: string,
): Promise<void> {
  await write(sql`/* deleteSavedReply */
    UPDATE community_saved_replies
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = ${currentUserId}
    WHERE id = ${replyId}
      AND community_id = ${communityId}
      AND deleted_at IS NULL
  `)
}
