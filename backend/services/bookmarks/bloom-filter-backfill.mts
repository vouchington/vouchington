import { createAsyncGeneratorFromCursor, read } from '@data-stores/psql'
import { normalizeKey } from '@ts-shared/utils/strings'
import type { EntityRelationMetadata } from '@services/entity-relations/metadata'

export async function getUserBookmarkRelationCount(
  userId: string,
  relation: EntityRelationMetadata,
): Promise<number> {
  // relation.table_name is safe: EntityRelationMetadata comes from the static entityRelationMetadatum allowlist
  const { rows } = await read(
    `/* getUserBookmarkRelationCount */
      SELECT COUNT(*)::bigint AS count
      FROM ${relation.table_name}
      WHERE subject_id = $1
        AND deleted_at IS NULL
    `,
    [userId],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function* bookmarkBloomBatchesFromDb(
  userId: string,
  relation: EntityRelationMetadata,
  batchSize: number,
): AsyncGenerator<string[]> {
  const batch: string[] = []
  const prefix = `${relation.predicate}:`
  // relation.table_name is safe: EntityRelationMetadata comes from the static entityRelationMetadatum allowlist
  for await (const row of createAsyncGeneratorFromCursor<{ object_id: string }>(
    `/* bookmarkBloomBatchesFromDb */
      SELECT object_id
      FROM ${relation.table_name}
      WHERE subject_id = $1
        AND deleted_at IS NULL
    `,
    [userId],
    { batchSize },
  )) {
    batch.push(prefix + normalizeKey(row.object_id))
    if (batch.length >= batchSize) yield batch.splice(0, batchSize) // remainder stays in batch
  }

  if (batch.length > 0) yield batch
}
