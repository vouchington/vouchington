import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { invalidateRssFeedItemsAndWaitForPurge } from '@services/entity-cache/invalidate-rss-feed-items'
import { publishEntityRelationElectionVoteStats } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { chunkArray } from './processing-limits.mts'
import { getRssFeedItemsWorkLimit } from './work-limits.mts'

export async function publishCategoryBackfillEffects(
  statTargets: Parameters<typeof publishEntityRelationElectionVoteStats>[0],
  changedItemIds: string[],
): Promise<void> {
  await publishEntityRelationElectionVoteStats(statTargets, { enqueueTopHashtagRefresh: false })
  await Promise.all([invalidateRssFeedItemChunks(changedItemIds), enqueueRefreshTopHashtags()])
}

async function invalidateRssFeedItemChunks(itemIds: string[]): Promise<void> {
  const INVALIDATION_CHUNK_SIZE = getRssFeedItemsWorkLimit('backfill_invalidation_chunk_size')
  const [chunk, ...remaining] = chunkArray(itemIds, INVALIDATION_CHUNK_SIZE)
  if (!chunk) return
  await invalidateRssFeedItemsAndWaitForPurge(...chunk)
  return invalidateRssFeedItemChunks(remaining.flat())
}
