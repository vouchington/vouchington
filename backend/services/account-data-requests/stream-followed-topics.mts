import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Streams followed topics for the given user with topic details. */
export function streamFollowedTopics(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamFollowedTopics */
    SELECT
      t.id AS topic_id,
      t.name,
      t.slug,
      t.topic_type,
      r.created_at
    FROM relation__user__follow__topic r
    JOIN topics t ON t.id = r.object_id
    WHERE r.subject_id = ${userId}
      AND r.deleted_at IS NULL
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    ORDER BY t.name ASC, t.id ASC
  `)
}
