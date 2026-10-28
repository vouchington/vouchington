/* oxlint-disable no-await-in-loop -- each capped terminal page is deleted before the next page. */
import type { TransactionQuery } from '@data-stores/psql'
import { listRetentionCandidates } from './cleanup-federation-candidates.mts'
import { deleteRetentionCandidates } from './cleanup-federation-delete.mts'
import type { FederationRetentionPage } from './cleanup-federation.types.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

export async function cleanupSweepWithQuery(
  options: { batchSize: number; maxBatches: number; now?: Date },
  query: TransactionQuery,
): Promise<FederationRetentionPage> {
  // UUIDv7 timestamps begin at the Unix epoch.
  const cutoff = new Date(Math.max(0, (options.now ?? new Date()).getTime() - 7 * DAY_MS))
  let deleted = 0
  let hasMore = false
  let continuationPosition: FederationRetentionPage['continuationPosition'] = null
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    // Oldest eligible terminal rows remain index-selectable on the next scheduled run.
    // no-mistakes-disable-next-line query-reached-per-item: capped oldest terminal page
    const candidates = await listRetentionCandidates(query, cutoff, options.batchSize + 1)
    const page = candidates.slice(0, options.batchSize)
    if (page.length === 0) {
      hasMore = false
      continuationPosition = null
      break
    }
    // no-mistakes-disable-next-line query-reached-per-item: capped terminal parent page
    deleted += await deleteRetentionCandidates(query, cutoff, page, options.batchSize)
    hasMore = candidates.length > options.batchSize
    continuationPosition = hasMore ? page.at(-1)! : null
    if (!hasMore) break
  }
  return { deleted, hasMore, continuationPosition }
}
