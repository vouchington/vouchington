import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'

export function buildBidirectionalInsertQuery(
  relation: EntityRelationMetadata,
  creator: BasicUser | null,
  subjectId: string,
  objectIds: readonly string[],
  options?: UpsertEntityRelationsOptions,
): SQLStatement {
  const reverseIds = objectIds.filter(id => id.toLowerCase() !== subjectId.toLowerCase())
  if (reverseIds.length > 0 && options?.skipIfDeleted) {
    throw new Error(`Bidirectional insert does not support ${relation.table_name}`)
  }
  const subjectIds = [...objectIds.map(() => subjectId), ...reverseIds]
  const pairedObjectIds = [...objectIds, ...reverseIds.map(() => subjectId)]

  // Write in primary-key order across both directions, then restore the caller's order.
  return sql`/* buildBidirectionalInsertQuery */
    WITH input AS (
      SELECT subject_id, object_id, ordinality
      FROM unnest(${subjectIds}::uuid[], ${pairedObjectIds}::uuid[]) WITH ORDINALITY
        AS t(subject_id, object_id, ordinality)
    ), upserted AS (
      INSERT INTO `.append(relation.table_name)
    .append(sql` AS target (subject_id, object_id, created_by_id)
      SELECT subject_id, object_id, ${creator?.id ?? null}
      FROM input
      ORDER BY subject_id, object_id
      ON CONFLICT (subject_id, object_id) DO UPDATE SET
        created_at = CASE
          WHEN target.deleted_at IS NULL THEN target.created_at
          ELSE clock_timestamp()
        END,
        deleted_at = NULL,
        deleted_by_id = NULL
      WHERE NOT ${options?.skipIfDeleted === true} OR target.deleted_at IS NULL
      RETURNING target.subject_id, target.object_id, target.created_by_id, target.created_at,
        target.deleted_at, target.deleted_by_id, target.id, target.votes_score_up,
        target.votes_score_none, target.votes_score_down, target.votes_count_up,
        target.votes_count_none, target.votes_count_down, target.votes_score_sort,
        target.votes_score_net, (old.subject_id IS NULL OR old.deleted_at IS NOT NULL) AS newly_active
    )
    SELECT upserted.subject_id, upserted.object_id, upserted.created_by_id, upserted.created_at,
      upserted.deleted_at, upserted.deleted_by_id, upserted.id, upserted.votes_score_up,
      upserted.votes_score_none, upserted.votes_score_down, upserted.votes_count_up,
      upserted.votes_count_none, upserted.votes_count_down, upserted.votes_score_sort,
      upserted.votes_score_net, upserted.newly_active,
      CASE WHEN input.ordinality <= ${objectIds.length} THEN 'forward' ELSE 'reverse' END AS direction
    FROM upserted
    JOIN input USING (subject_id, object_id)
    ORDER BY input.ordinality`)
}
