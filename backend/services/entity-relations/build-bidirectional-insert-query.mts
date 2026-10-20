import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { EntityIdentifier, UpsertEntityTypes } from './upsert-helpers.mts'
import type { UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'
import { buildInsertQuery } from './build-insert-query.mts'
import { appendRelationIdAfterEndpoints } from './relation-id-after-endpoints.mts'

type RelationPair = {
  subject: UpsertEntityTypes | EntityIdentifier
  object: UpsertEntityTypes | EntityIdentifier
}

/**
 * Both directions in one statement. Self-pairs are not provably rejected before this write, so the
 * reverse row is omitted when subject and object are the same id. Two upserts of one primary key
 * in one statement fail with "ON CONFLICT DO UPDATE command cannot affect row a second time".
 * `related` is the only bidirectional predicate; it is not a follow or an ordered relation.
 */
export function buildBidirectionalInsertQuery(
  relation: EntityRelationMetadata,
  creator: BasicUser | null,
  forwardPairs: RelationPair[],
  reversePairs: RelationPair[],
  options?: UpsertEntityRelationsOptions,
): SQLStatement {
  const distinctReversePairs = reversePairs.filter(
    pair => pair.subject.id.toLowerCase() !== pair.object.id.toLowerCase(),
  )
  if (distinctReversePairs.length === 0)
    return buildInsertQuery(relation, creator, forwardPairs, options)
  if (relation.order_index || options?.skipIfDeleted || isUserFollowRelation(relation)) {
    throw new Error(`Bidirectional insert does not support ${relation.table_name}`)
  }
  const query = sql`/* buildInsertQuery */
    WITH `
  appendDirection(query, 'forward', relation, creator, forwardPairs)
  query.append(sql`, `)
  appendDirection(query, 'reverse', relation, creator, distinctReversePairs)
  query.append(sql`
    SELECT rows.*
    FROM (
      SELECT forward_upserted.*,
        (forward_existing.subject_id IS NULL OR forward_existing.deleted_at IS NOT NULL) AS newly_active,
        'forward'::text AS direction,
        forward_input.ordinality
      FROM forward_upserted
      JOIN forward_input
        ON forward_input.subject_id = forward_upserted.subject_id
        AND forward_input.object_id = forward_upserted.object_id
      LEFT JOIN forward_existing
        ON forward_existing.subject_id = forward_upserted.subject_id
        AND forward_existing.object_id = forward_upserted.object_id
      UNION ALL
      SELECT reverse_upserted.*,
        (reverse_existing.subject_id IS NULL OR reverse_existing.deleted_at IS NOT NULL) AS newly_active,
        'reverse'::text AS direction,
        reverse_input.ordinality
      FROM reverse_upserted
      JOIN reverse_input
        ON reverse_input.subject_id = reverse_upserted.subject_id
        AND reverse_input.object_id = reverse_upserted.object_id
      LEFT JOIN reverse_existing
        ON reverse_existing.subject_id = reverse_upserted.subject_id
        AND reverse_existing.object_id = reverse_upserted.object_id
    ) rows
    ORDER BY rows.direction, rows.ordinality
  `)
  return query
}

function appendDirection(
  query: SQLStatement,
  prefix: 'forward' | 'reverse',
  relation: EntityRelationMetadata,
  creator: BasicUser | null,
  pairs: RelationPair[],
): void {
  const subjectIds = pairs.map(({ subject }) => subject.id)
  const objectIds = pairs.map(({ object }) => object.id)
  query.append(`${prefix}_input AS (
      SELECT subject_id, object_id, ordinality
      FROM unnest(`)
  query.append(sql`${subjectIds}::uuid[], ${objectIds}::uuid[]) WITH ORDINALITY
        AS t(subject_id, object_id, ordinality)
    ), `)
  query.append(`${prefix}_existing AS MATERIALIZED (
      SELECT r.subject_id, r.object_id, r.deleted_at
      FROM `)
  query.append(relation.table_name)
  query.append(` r
      JOIN ${prefix}_input ON ${prefix}_input.subject_id = r.subject_id
        AND ${prefix}_input.object_id = r.object_id
      ORDER BY r.subject_id, r.object_id
      FOR UPDATE
    ), ${prefix}_upserted AS (
      INSERT INTO `)
  query.append(relation.table_name)
  query.append(sql` (subject_id, object_id, created_by_id, id)
      SELECT input.subject_id, input.object_id, ${creator?.id ?? null}, `)
  appendRelationIdAfterEndpoints(query)
  query.append(sql`
      FROM `)
  query.append(`${prefix}_input input
      LEFT JOIN ${prefix}_existing existing
        ON existing.subject_id = input.subject_id AND existing.object_id = input.object_id
      ORDER BY input.subject_id, input.object_id
      ON CONFLICT (subject_id, object_id)
        DO UPDATE SET
          created_at = CASE
            WHEN `)
  query.append(relation.table_name)
  query.append(`.deleted_at IS NULL THEN `)
  query.append(relation.table_name)
  query.append(`.created_at
            ELSE clock_timestamp()
          END,
          deleted_at = NULL,
          deleted_by_id = NULL
      RETURNING *
    )`)
}

function isUserFollowRelation(relation: EntityRelationMetadata): boolean {
  return (
    relation.subject_type === 'user' &&
    relation.predicate === 'follow' &&
    relation.object_type === 'user'
  )
}
