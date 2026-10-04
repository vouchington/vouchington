import { getElectionsVotesWorkLimit } from '@services/elections-votes/work-limits'

export function chunkRelationIds(relationIds: readonly string[]): string[][] {
  const PRIMARY_REFRESH_BATCH_SIZE = getElectionsVotesWorkLimit('primary_refresh_batch_size')
  const ids = [...new Set(relationIds.map(id => id.toLowerCase()))].toSorted()
  return Array.from({ length: Math.ceil(ids.length / PRIMARY_REFRESH_BATCH_SIZE) }, (_, index) =>
    ids.slice(index * PRIMARY_REFRESH_BATCH_SIZE, (index + 1) * PRIMARY_REFRESH_BATCH_SIZE),
  )
}
