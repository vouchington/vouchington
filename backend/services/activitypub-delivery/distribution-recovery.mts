import { read } from '@data-stores/psql'
import { getMaxUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'

const LAST_VOTE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

export type OutboundRecoverySource = 'follows' | 'votes'
export type OutboundRecoveryRow =
  | {
      source: 'follows'
      sourceUserId: string
      targetUserId: string
      originalFollowActivityId: string
      deleted: boolean
      cursor: string
    }
  | {
      source: 'votes'
      sourceUserId: string
      targetPostId: string
      activityId: string
      originalLikeActivityId: string | null
      cursor: string
    }

export async function listPendingOutboundDistributionPage(
  source: OutboundRecoverySource,
  after: string | undefined,
  limit: number,
  throughPostId?: string,
): Promise<{ rows: OutboundRecoveryRow[]; next?: string; throughPostId?: string }> {
  if (source === 'follows') {
    const [afterSubjectId, afterObjectId] = after?.split('__') ?? []
    if (after && (!afterSubjectId || !afterObjectId)) throw new Error('Invalid follow cursor')
    const statement = sql`/* listPendingOutboundDistributionPage:follows */
      SELECT subject_id, object_id, outbound_activitypub_follow_activity_id AS activity_id,
        deleted_at IS NOT NULL AS deleted
      FROM relation__user__follow__user
      WHERE outbound_activitypub_distributed_activity_id IS NULL
        AND outbound_activitypub_follow_activity_id IS NOT NULL`
    if (afterSubjectId && afterObjectId) {
      statement.append(sql` AND (subject_id, object_id) > (${afterSubjectId}, ${afterObjectId})`)
    }
    statement.append(sql` ORDER BY subject_id, object_id LIMIT ${limit + 1}`)
    const { rows } = await read<{
      subject_id: string
      object_id: string
      activity_id: string
      deleted: boolean
    }>(statement)
    const page = rows.slice(0, limit).map(row => ({
      source: 'follows' as const,
      sourceUserId: row.subject_id,
      targetUserId: row.object_id,
      originalFollowActivityId: row.activity_id,
      deleted: row.deleted,
      cursor: `${row.subject_id}__${row.object_id}`,
    }))
    return { rows: page, ...(rows.length > limit ? { next: page.at(-1)!.cursor } : {}) }
  }

  const [afterPostId, afterVoteId] = after?.split('__') ?? []
  if (after && (!afterPostId || !afterVoteId)) throw new Error('Invalid vote cursor')
  // Keep a closed post window across continuations, then probe only this page's vote partitions.
  const fixedUpperPostId = throughPostId ?? getMaxUUIDv7ForDate(new Date())
  const posts = sql`/* listPendingOutboundDistributionPage:votePosts */
    SELECT id FROM posts WHERE id <= ${fixedUpperPostId}`
  if (afterPostId) {
    posts.append(
      afterVoteId === LAST_VOTE_ID ? sql` AND id > ${afterPostId}` : sql` AND id >= ${afterPostId}`,
    )
  }
  posts.append(sql` ORDER BY id LIMIT ${limit + 1}`)
  const { rows: postRows } = await read<{ id: string }>(posts)
  const postPage = postRows.slice(0, limit)
  const firstPostId = postPage[0]?.id
  const lastPostId = postPage.at(-1)?.id
  if (!firstPostId || !lastPostId) return { rows: [], throughPostId: fixedUpperPostId }

  const statement = sql`/* listPendingOutboundDistributionPage:votes */
    SELECT post_id, id, user_id, outbound_activitypub_original_like_activity_id AS original_id
    FROM post_votes
    WHERE post_id >= ${firstPostId}
      AND post_id <= ${lastPostId}
      AND outbound_activitypub_distributed_at IS NULL
      AND (outbound_activitypub_like_activity_id = id
        OR outbound_activitypub_original_like_activity_id IS NOT NULL)`
  if (afterPostId && afterVoteId && afterVoteId !== LAST_VOTE_ID) {
    statement.append(sql` AND (post_id, id) > (${afterPostId}, ${afterVoteId})`)
  }
  statement.append(sql` ORDER BY post_id, id LIMIT ${limit + 1}`)
  const { rows } = await read<{
    post_id: string
    id: string
    user_id: string
    original_id: string | null
  }>(statement)
  const page = rows.slice(0, limit).map(row => ({
    source: 'votes' as const,
    sourceUserId: row.user_id,
    targetPostId: row.post_id,
    activityId: row.id,
    originalLikeActivityId: row.original_id,
    cursor: `${row.post_id}__${row.id}`,
  }))
  const next =
    rows.length > limit
      ? page.at(-1)!.cursor
      : postRows.length > limit
        ? `${lastPostId}__${LAST_VOTE_ID}`
        : undefined
  return { rows: page, ...(next ? { next } : {}), throughPostId: fixedUpperPostId }
}
