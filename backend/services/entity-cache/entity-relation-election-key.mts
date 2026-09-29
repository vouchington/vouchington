/**
 * Identity of one election row. A relation UUID is only unique within its relation table, so the
 * table is part of every fetch, cache and invalidation key.
 */
export type EntityRelationElectionCacheKey = {
  entityRelationId: string
  relationTable: string
}

export function serializeEntityRelationElectionCacheKey(
  key: EntityRelationElectionCacheKey,
): string {
  return JSON.stringify([key.relationTable, key.entityRelationId])
}
