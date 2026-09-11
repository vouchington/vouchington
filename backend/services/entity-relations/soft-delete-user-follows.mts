import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getDeletedFollowPairs, type DeletedEntityRelation } from './deleted-relation-results.mts'
import type { DeletedFollowPair } from './enqueue-undo-follow-side-effects.mts'

export async function softDeleteUserFollowRelations(
  subjectUserId: string,
  objectUserIds: string[],
  options: QueryOptions = {},
): Promise<DeletedFollowPair[]> {
  if (objectUserIds.length === 0) return []

  const run = options.query ?? write
  // Pre-lock in ascending object_id order to prevent ABBA deadlocks when called
  // from within a transaction that already holds other locks. subject_id is fixed,
  // so ordering on object_id gives deterministic lock acquisition across callers.
  await run(sql`/* softDeleteUserFollowRelations lockRows */
    SELECT subject_id, object_id FROM relation__user__follow__user
    WHERE subject_id = ${subjectUserId}
      AND object_id = ANY(${objectUserIds}::uuid[])
      AND deleted_at IS NULL
    ORDER BY object_id
    FOR UPDATE
  `)
  const { rows } = await run<DeletedEntityRelation>(sql`/* softDeleteUserFollowRelations */
    UPDATE relation__user__follow__user
    SET deleted_at = NOW(), deleted_by_id = ${subjectUserId}
    WHERE subject_id = ${subjectUserId}
      AND object_id = ANY(${objectUserIds}::uuid[])
      AND deleted_at IS NULL
    RETURNING subject_id, object_id, outbound_ap_follow_activity_id, uuidv7() AS undo_activity_id
  `)
  return getDeletedFollowPairs(rows)
}
