import { getRegisteredBookmarkBloomHandler } from './bookmark-bloom-handler-registry.mts'
import type { EntityRelationMetadata } from './metadata.mts'
import type { EntityRelation } from './upsert-helpers.mts'

export async function maintainBookmarkBloomForRelations(
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
): Promise<void> {
  if (!relation.is_bookmark || relation.subject_type !== 'user') return
  if (relations.length === 0) return

  // Group object IDs by subject_id (the bookmark owner) — handles multi-subject writes.
  const bySubject = new Map<string, string[]>()
  for (const r of relations) {
    const objectIds = bySubject.get(r.subject_id) ?? []
    objectIds.push(r.object_id)
    bySubject.set(r.subject_id, objectIds)
  }

  const handler = getRegisteredBookmarkBloomHandler()
  await Promise.all(
    [...bySubject.entries()].map(([subjectId, objectIds]) =>
      handler(subjectId, relation.table_name, objectIds),
    ),
  )
}
