import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'

const MAX_PAGE_SIZE = 500
const MAX_PAGES_PER_RUN = 10

export type PersistedPage<Position> = {
  deleted: number
  hasMore: boolean
  continuation: Position | null
}

/** Each page commits its own cursor; the next scheduled run resumes after the last selected row. */
export async function runPersistedRetentionPages<Position>(
  limits: { batchSize?: number; maxBatches: number },
  deletePage: (batchSize: number) => Promise<PersistedPage<Position>>,
): Promise<PersistedPage<Position>> {
  const batchSize = Math.min(
    normalizePositiveInteger(limits.batchSize, DEFAULT_BATCH_SIZE, 'batchSize'),
    MAX_PAGE_SIZE,
  )
  const maxBatches = Math.min(
    assertPositiveInteger(limits.maxBatches, 'maxBatches'),
    MAX_PAGES_PER_RUN,
  )
  let result: PersistedPage<Position> = { deleted: 0, hasMore: false, continuation: null }
  // oxlint-disable no-await-in-loop -- each committed cursor page determines the next page
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // no-mistakes-disable-next-line query-reached-per-item: runtime-capped persisted pages must serialize on one cursor
    const page = await deletePage(batchSize)
    result = {
      deleted: result.deleted + page.deleted,
      hasMore: page.hasMore,
      continuation: page.continuation,
    }
    if (!page.hasMore) break
  }
  // oxlint-enable no-await-in-loop
  return result
}
