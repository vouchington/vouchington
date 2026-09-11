import sql, { type SQLStatement } from 'sql-template-strings'
import type { EntityRelationMetadata } from './metadata.mts'
import type { DeletedFollowPair } from './enqueue-undo-follow-side-effects.mts'

export type DeletedEntityRelation = {
  subject_id: string
  object_id: string
  outbound_ap_follow_activity_id?: string | null
  undo_activity_id?: string | null
}

export function appendDeletedRelationReturning(
  query: SQLStatement,
  relation: EntityRelationMetadata,
): void {
  query.append(sql` RETURNING subject_id, object_id`)
  if (relation.table_name === 'relation__user__follow__user') {
    query.append(sql`, outbound_ap_follow_activity_id, uuidv7() AS undo_activity_id`)
  }
}

export function getDeletedFollowPairs(
  deletedRelations: DeletedEntityRelation[],
): DeletedFollowPair[] {
  return deletedRelations.map(row => ({
    subjectId: row.subject_id,
    objectId: row.object_id,
    activityPubUndoIdentity:
      row.outbound_ap_follow_activity_id && row.undo_activity_id
        ? {
            originalActivityId: row.outbound_ap_follow_activity_id,
            undoActivityId: row.undo_activity_id,
          }
        : null,
  }))
}
