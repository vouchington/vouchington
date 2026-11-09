import sql, { type SQLStatement } from 'sql-template-strings'
import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import type { EntityIdentifier, UpsertEntityTypes } from './upsert-helpers.mts'
import type { UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'
import { buildInsertQuery } from './build-insert-query.mts'

export function buildUpsertRelationQuery(
  relation: EntityRelationMetadata,
  creator: BasicUser | null,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
  options: UpsertEntityRelationsOptions | undefined,
): SQLStatement {
  const cycle = options?.remoteFollowCycle
  if (!cycle)
    return buildInsertQuery(
      relation,
      creator,
      objects.map(object => ({ subject, object })),
      options,
    )
  if (
    relation.table_name !== 'relation__remote_actor__follow__user' ||
    options?.origin !== 'remote' ||
    objects.length !== 1
  )
    throw new Error('Remote Follow cycle requires one remote actor/user relation')
  return buildRemoteFollowCycleQuery(subject.id, objects[0]!.id, cycle)
}

/** Install one remote Follow only if the relation still names the observed cycle. */
export function buildRemoteFollowCycleQuery(
  subjectId: string,
  objectId: string,
  cycle: { expectedId: string | null; nextId: string },
): SQLStatement {
  if (cycle.expectedId !== null) {
    return sql`/* installRemoteFollowCycle */ UPDATE relation__remote_actor__follow__user
      SET created_at = CASE WHEN deleted_at IS NULL THEN created_at ELSE clock_timestamp() END,
        deleted_at = NULL, deleted_by_id = NULL, inbound_follow_activity_row_id = ${cycle.nextId}::uuid
      WHERE subject_id = ${subjectId}::uuid AND object_id = ${objectId}::uuid
        AND inbound_follow_activity_row_id = ${cycle.expectedId}::uuid
      RETURNING WITH (OLD AS prior, NEW AS next_row) next_row.*,
        (prior.deleted_at IS NOT NULL) AS newly_active`
  }
  return sql`/* installRemoteFollowCycle */ INSERT INTO relation__remote_actor__follow__user
      (subject_id, object_id, created_by_id, inbound_follow_activity_row_id)
    VALUES (${subjectId}::uuid, ${objectId}::uuid, NULL, ${cycle.nextId}::uuid)
    ON CONFLICT (subject_id, object_id) DO UPDATE SET
      created_at = CASE WHEN relation__remote_actor__follow__user.deleted_at IS NULL
        THEN relation__remote_actor__follow__user.created_at ELSE clock_timestamp() END,
      deleted_at = NULL, deleted_by_id = NULL,
      inbound_follow_activity_row_id = EXCLUDED.inbound_follow_activity_row_id
    WHERE relation__remote_actor__follow__user.inbound_follow_activity_row_id IS NULL
    RETURNING WITH (OLD AS prior, NEW AS next_row) next_row.*,
      (prior.subject_id IS NULL OR prior.deleted_at IS NOT NULL) AS newly_active`
}
