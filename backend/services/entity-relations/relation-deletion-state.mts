import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { EntityRelationMetadata } from './metadata.mts'
import type { EntityIdentifier, UpsertEntityTypes } from './upsert-helpers.mts'

export type EntityRelationDeletionState = 'active' | 'deleted' | 'absent'

// Read-only status check for a single subject/object relation row, used to distinguish "never
// created" from "explicitly soft-deleted" before deciding whether replaying an upsert is safe
// (e.g. resendAcceptForDuplicateFollow must not resurrect a relation an Undo already removed).
export async function getEntityRelationDeletionState(
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  object: UpsertEntityTypes | EntityIdentifier,
): Promise<EntityRelationDeletionState> {
  const query = sql`/* getEntityRelationDeletionState */ SELECT deleted_at FROM `
  query.append(relation.table_name)
  query.append(sql` WHERE subject_id = ${subject.id} AND object_id = ${object.id}`)
  const { rows } = await read(query)
  if (rows.length === 0) return 'absent'
  return (rows[0] as { deleted_at: Date | null }).deleted_at === null ? 'active' : 'deleted'
}
