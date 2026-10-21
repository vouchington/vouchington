import assert from 'http-assert'
import { getEntityRelationTableNameOrThrow, type EntityRelationMetadata } from './metadata.mts'
import { getEntityId, type EntityIdentifier, type UpsertEntityTypes } from './upsert-helpers.mts'
import { read, type QueryExecutor, type TransactionQuery } from '@data-stores/psql'

export async function assertTopicParentRelationsAreValid(
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
  query: QueryExecutor = read,
): Promise<void> {
  if (
    relation.subject_type !== 'topic' ||
    relation.object_type !== 'topic' ||
    relation.predicate !== 'parent'
  ) {
    return
  }

  const subjectId = getEntityId(subject)
  const objectIds = objects.map(getEntityId)
  assert(!objectIds.includes(subjectId), 422, 'A topic cannot be its own parent')

  const tableName = getEntityRelationTableNameOrThrow({
    subjectType: 'topic',
    predicate: 'parent',
    objectType: 'topic',
  })

  const { rows } = await query(
    `/* assertTopicParentRelationsAreValid */
    WITH RECURSIVE descendants AS (
      SELECT subject_id, object_id, ARRAY[object_id, subject_id] AS path
      FROM ${tableName}
      WHERE object_id = $1
        AND deleted_at IS NULL
      UNION ALL
      SELECT rel.subject_id, rel.object_id, descendants.path || rel.subject_id
      FROM ${tableName} rel
      JOIN descendants ON descendants.subject_id = rel.object_id
      WHERE rel.deleted_at IS NULL
        AND NOT rel.subject_id = ANY(descendants.path)
    )
    SELECT subject_id
    FROM descendants
    WHERE subject_id = ANY($2::uuid[])
    LIMIT 1
    `,
    [subjectId, objectIds],
  )

  assert(rows.length === 0, 422, 'Topic parent relation would create a cycle')
}

/** Revalidate after any merge that blocked this writer; the early replica read can be stale. */
export async function lockAndAssertTopicParentRelations(
  query: TransactionQuery,
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
): Promise<void> {
  if (relation.table_name !== 'relation__topic__parent__topic') return
  await query(
    `/* lockAndAssertTopicParentRelations */ LOCK TABLE relation__topic__parent__topic IN ROW EXCLUSIVE MODE`,
  )
  await assertTopicParentRelationsAreValid(relation, subject, objects, query)
}
