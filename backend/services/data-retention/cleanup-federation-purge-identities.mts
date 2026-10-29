import type { TransactionQuery } from '@data-stores/psql'

/** Retire a bounded active Follow page before its local target is finally purged. */
export async function terminalizePurgedUserRemoteFollows(
  query: TransactionQuery,
  userId: string,
  batchSize: number,
): Promise<number> {
  const { rowCount } = await query(
    `/* terminalizePurgedUserRemoteFollows */
     WITH candidates AS MATERIALIZED (
       SELECT id FROM activitypub_remote_follow_activities
       WHERE target_user_id = $1::uuid AND undone_at IS NULL
       ORDER BY id LIMIT $2 FOR UPDATE
     )
     UPDATE activitypub_remote_follow_activities activity
     SET undone_at = clock_timestamp()
     FROM candidates WHERE activity.id = candidates.id AND activity.undone_at IS NULL`,
    [userId, batchSize],
  )
  return rowCount ?? 0
}

/** Inspect one indexed post and at most batchSize active Likes per page. */
export async function terminalizePurgedUserPostLikes(
  query: TransactionQuery,
  userId: string,
  batchSize: number,
  postId?: string,
): Promise<{ processed: number; nextPostId: string | null }> {
  const { rows: posts } = postId
    ? await query<{ id: string }>(
        `/* selectPurgedUserPostForLikeRetirement:resume */
         SELECT id FROM posts WHERE created_by_id = $1::uuid AND id >= $2::uuid
         ORDER BY id LIMIT 1 FOR UPDATE`,
        [userId, postId],
      )
    : await query<{ id: string }>(
        `/* selectPurgedUserPostForLikeRetirement:first */
         -- no-mistakes-disable-next-line postgres-required-predicates: the first author post spans id partitions; the (created_by_id, id) page stops at one indexed candidate
         SELECT id FROM posts WHERE created_by_id = $1::uuid
         ORDER BY id LIMIT 1 FOR UPDATE`,
        [userId],
      )
  const currentPostId = posts[0]?.id
  if (!currentPostId) return { processed: 0, nextPostId: null }
  const { rowCount } = await query(
    `/* terminalizePurgedUserPostLikes */
     WITH candidates AS MATERIALIZED (
       SELECT id FROM activitypub_post_like_activities
       WHERE post_id = $1::uuid AND undone_at IS NULL
       ORDER BY id LIMIT $2 FOR UPDATE
     )
     UPDATE activitypub_post_like_activities activity
     SET undone_at = clock_timestamp()
     WHERE activity.id = ANY((SELECT array_agg(id) FROM candidates)::uuid[])
       AND activity.undone_at IS NULL`,
    [currentPostId, batchSize],
  )
  const terminalized = rowCount ?? 0
  if (terminalized === batchSize) return { processed: terminalized, nextPostId: currentPostId }
  const { rows: successors } = await query<{ id: string }>(
    `/* selectNextPurgedUserPostForLikeRetirement */
     SELECT id FROM posts WHERE created_by_id = $1::uuid AND id > $2::uuid
     ORDER BY id LIMIT 1 FOR UPDATE`,
    [userId, currentPostId],
  )
  // The post and successor lookups are fixed indexed overhead. A post with no active
  // Likes still consumes one unit so a large author cannot be scanned in one job.
  return { processed: Math.max(1, terminalized), nextPostId: successors[0]?.id ?? null }
}
