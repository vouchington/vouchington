import sql, { type SQLStatement } from 'sql-template-strings'

/** Followed authors, or everyone else, as a keyed probe on the viewer's follow relation. */
export function appendFollowingPhaseFilters(
  filters: SQLStatement[],
  userId: string,
  phase: 'followed' | 'other',
): void {
  const followedAuthor = sql`EXISTS (
    SELECT 1
    FROM relation__user__follow__user viewer_following
    WHERE viewer_following.subject_id = ${userId}
      AND viewer_following.object_id = posts.created_by_id
      AND viewer_following.deleted_at IS NULL
  )`
  filters.push(phase === 'followed' ? followedAuthor : sql`NOT `.append(followedAuthor))
}
