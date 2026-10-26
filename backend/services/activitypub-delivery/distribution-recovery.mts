import { write } from '@data-stores/psql'
import { getMaxUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'

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
    const { rows } = await write<{
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
  // Keep a closed post window across continuations. The pending partial index supplies the
  // keyset directly, so an idle sweep does not enumerate unrelated posts.
  const fixedUpperPostId = throughPostId ?? getMaxUUIDv7ForDate(new Date())
  const statement = sql`/* listPendingOutboundDistributionPage:votes */
    WITH pending_page AS MATERIALIZED (
      SELECT post_id, id, user_id,
        outbound_activitypub_like_activity_id AS like_id,
        outbound_activitypub_original_like_activity_id AS original_id
      FROM post_votes
      WHERE post_id <= ${fixedUpperPostId}
        AND outbound_activitypub_distributed_at IS NULL
        AND (outbound_activitypub_like_activity_id = id
          OR outbound_activitypub_original_like_activity_id IS NOT NULL)`
  if (afterPostId && afterVoteId) {
    statement.append(sql` AND post_id >= ${afterPostId}`)
    statement.append(sql` AND (post_id, id) > (${afterPostId}, ${afterVoteId})`)
  }
  statement.append(sql` ORDER BY post_id, id LIMIT ${limit + 1}
    )
    SELECT pending.post_id, pending.id, pending.user_id,
      pending.like_id, pending.original_id,
      latest.like_id AS latest_like_id
    FROM pending_page pending
    LEFT JOIN LATERAL (
      SELECT current_vote.outbound_activitypub_like_activity_id AS like_id
      FROM post_votes current_vote
      WHERE current_vote.post_id = pending.post_id
        AND current_vote.user_id = pending.user_id
      ORDER BY current_vote.id DESC
      LIMIT 1
    ) latest ON TRUE
    ORDER BY pending.post_id, pending.id`)
  const { rows } = await write<{
    post_id: string
    id: string
    user_id: string
    like_id: string | null
    original_id: string | null
    latest_like_id: string | null
  }>(statement)
  const rawPage = rows.slice(0, limit)
  const page = rawPage.flatMap(row =>
    row.like_id === row.id && row.latest_like_id !== row.id
      ? []
      : [
          {
            source: 'votes' as const,
            sourceUserId: row.user_id,
            targetPostId: row.post_id,
            activityId: row.id,
            originalLikeActivityId: row.original_id,
            cursor: `${row.post_id}__${row.id}`,
          },
        ],
  )
  const lastRawRow = rawPage.at(-1)
  const next = rows.length > limit ? `${lastRawRow!.post_id}__${lastRawRow!.id}` : undefined
  return { rows: page, ...(next ? { next } : {}), throughPostId: fixedUpperPostId }
}
