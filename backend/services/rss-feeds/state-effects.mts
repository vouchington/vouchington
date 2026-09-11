import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import type { QueryOptions } from '@data-stores/psql/types'

export async function applyCommittedRssFeedStateChangeEffects(
  rssFeedId: string,
  updated: boolean,
  options: QueryOptions,
): Promise<void> {
  if (!updated || options.query || options.client) return
  await invalidate.rss_feeds(rssFeedId)
  void enqueueRefreshTopHashtags()
}
