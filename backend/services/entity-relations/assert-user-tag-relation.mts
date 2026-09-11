import assert from 'http-assert'
import { read } from '@data-stores/psql'
import { USER_TAG_SLUGS } from '@voucha/types/entities/user-tags'
import type { EntityRelationMetadata } from './metadata.mts'
import { getEntityId, type EntityIdentifier, type UpsertEntityTypes } from './upsert-helpers.mts'
import sql from 'sql-template-strings'

export async function assertUserTagObjectsAreValid(
  relation: EntityRelationMetadata,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
): Promise<void> {
  if (
    relation.subject_type !== 'user' ||
    relation.predicate !== 'category' ||
    relation.object_type !== 'topic'
  ) {
    return
  }

  const { rows } = await read(sql`/* assertUserTagObjectsAreValid */
    SELECT id
    FROM topics
    WHERE slug = ANY(${USER_TAG_SLUGS})
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
  `)
  const allowedIds = new Set(rows.map(row => row.id as string))
  for (const object of objects) {
    assert(allowedIds.has(getEntityId(object)), 422, 'Invalid user tag')
  }
}
