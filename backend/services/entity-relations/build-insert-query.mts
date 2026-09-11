import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import type {
  EntityIdentifier,
  UpsertEntityRelationsOptions,
  UpsertEntityTypes,
} from './upsert-helpers.mts'

function buildRelationColumns(relation: EntityRelationMetadata): {
  columns: string[]
  primaryKeyColumns: string[]
} {
  const primaryKeyColumns: string[] = ['subject_id', 'object_id']
  const columns: string[] = [...primaryKeyColumns, 'created_by_id']
  if (isUserFollowRelation(relation)) {
    columns.push('outbound_ap_follow_activity_id')
  }
  /* c8 ignore next 3 -- no entity relation currently configures order_index */
  if (relation.order_index) {
    columns.push('order_index')
  }

  return { columns, primaryKeyColumns }
}

export function buildInsertQuery(
  relation: EntityRelationMetadata,
  // null only for remote-origin writes (e.g. an inbound ActivityPub Follow) — created_by_id is a
  // nullable FK (`ON DELETE SET NULL`) for exactly this reason.
  creator: BasicUser | null,
  pairs: Array<{
    subject: UpsertEntityTypes | EntityIdentifier
    object: UpsertEntityTypes | EntityIdentifier
  }>,
  options?: UpsertEntityRelationsOptions,
): SQLStatement {
  if (pairs.length === 0) throw new Error('buildInsertQuery requires at least one pair')
  const { columns, primaryKeyColumns } = buildRelationColumns(relation)
  const subjectIds = pairs.map(({ subject }) => subject.id)
  const objectIds = pairs.map(({ object }) => object.id)
  const table = relation.table_name

  // `existing` locks the row before the upsert reads it. This matters when a concurrent
  // soft-delete commits between this statement's snapshot and its ON CONFLICT update: without the
  // lock, `existing` can report the stale active version while the upsert resurrects the deleted
  // version, causing downstream publication capture to skip that real eligibility transition.
  // The final SELECT therefore exposes `newly_active`: true for a fresh insert or a resurrection,
  // false for a no-op retry of an already-active row. `xmax = 0` alone can't make this distinction
  // because both a no-op retry and a resurrection take the ON CONFLICT DO UPDATE path.
  const query = sql`/* buildInsertQuery */
    WITH input AS (
      SELECT subject_id, object_id, ordinality
      FROM unnest(${subjectIds}::uuid[], ${objectIds}::uuid[]) WITH ORDINALITY
        AS t(subject_id, object_id, ordinality)
    ),
    existing AS MATERIALIZED (
      SELECT r.subject_id, r.object_id, r.deleted_at
      FROM `
  query.append(table)
  query.append(sql` r
      JOIN input ON input.subject_id = r.subject_id AND input.object_id = r.object_id
      ORDER BY r.subject_id, r.object_id
      FOR UPDATE
    ),
    upserted AS (
      INSERT INTO `)
  query.append(table)
  query.append(sql` (`)
  query.append(columns.join(', '))
  query.append(sql`)
      SELECT input.subject_id, input.object_id, ${creator?.id ?? null}`)
  if (isUserFollowRelation(relation)) {
    query.append(sql`, uuidv7()`)
  }
  /* c8 ignore next 3 -- no entity relation currently configures order_index */
  if (relation.order_index) {
    query.append(sql`, ${options?.order_index ?? 0}`)
  }
  query.append(sql`
      FROM input
      LEFT JOIN existing
        ON existing.subject_id = input.subject_id AND existing.object_id = input.object_id
      ORDER BY input.subject_id, input.object_id
      ON CONFLICT (`)
  query.append(primaryKeyColumns.join(', '))
  query.append(sql`)
	        DO UPDATE SET
	          created_at = CASE
	            WHEN `)
  query.append(table)
  query.append(sql`.deleted_at IS NULL THEN `)
  query.append(table)
  query.append(sql`.created_at
	            ELSE clock_timestamp()
	          END,
	          deleted_at = NULL,
	          deleted_by_id = NULL`)
  if (isUserFollowRelation(relation)) {
    query.append(sql`,
            outbound_ap_follow_activity_id = CASE
              WHEN `)
    query.append(table)
    query.append(sql`.deleted_at IS NULL
                THEN `)
    query.append(table)
    query.append(sql`.outbound_ap_follow_activity_id
              ELSE uuidv7()
            END`)
  }
  if (options?.skipIfDeleted) {
    query.append(sql`
	          WHERE `)
    query.append(table)
    query.append(sql`.deleted_at IS NULL`)
  }
  query.append(sql`
	      RETURNING *
	    )
    SELECT upserted.*, (existing.subject_id IS NULL OR existing.deleted_at IS NOT NULL) AS newly_active
    FROM upserted
    JOIN input
      ON input.subject_id = upserted.subject_id AND input.object_id = upserted.object_id
    LEFT JOIN existing
      ON existing.subject_id = upserted.subject_id AND existing.object_id = upserted.object_id
    ORDER BY input.ordinality
	  `)

  return query
}

function isUserFollowRelation(relation: EntityRelationMetadata): boolean {
  return (
    relation.subject_type === 'user' &&
    relation.predicate === 'follow' &&
    relation.object_type === 'user'
  )
}
