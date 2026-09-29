export const PRIMARY_REFRESH_BATCH_SIZE = 1_000

export function chunkRelationIds(relationIds: readonly string[]): string[][] {
  const ids = [...new Set(relationIds.map(id => id.toLowerCase()))].toSorted()
  return Array.from({ length: Math.ceil(ids.length / PRIMARY_REFRESH_BATCH_SIZE) }, (_, index) =>
    ids.slice(index * PRIMARY_REFRESH_BATCH_SIZE, (index + 1) * PRIMARY_REFRESH_BATCH_SIZE),
  )
}
