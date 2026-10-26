import { hardDeleteRssFeedSourcePage } from '@services/rss-feeds/hard-delete-source-page'
import { hardDeleteRssFeedChildPage } from '@services/rss-feeds/hard-delete-child-page'
import { finalizeHardDeleteRssFeed } from '@services/rss-feeds/hard-delete-finalize'
import {
  enqueueHardDeleteRssFeedSourcePage,
  enqueueHardDeleteRssFeedChildPage,
  enqueueFinalizeHardDeleteRssFeed,
} from '@queues/rss-feed-maintenance/enqueues/hard-delete'
import { enqueueContinueRssFeedItemCategorySnapshotReconciliation } from '@queues/rss-feed-maintenance/enqueues/item-categories'
import {
  RSS_FEED_HARD_DELETE_CHILD_PHASES,
  type RssFeedHardDeleteChildPhase,
} from '@queues/rss-feed-maintenance/types'

const firstChildPhase = RSS_FEED_HARD_DELETE_CHILD_PHASES[0]

/** Each admission commits one bounded page before the next queued page. */
export async function processHardDeleteRssFeedSourcePage(data: {
  rssFeedId: string
}): Promise<void> {
  const result = await hardDeleteRssFeedSourcePage(data.rssFeedId)
  if (result.removed > 0) await enqueueContinueRssFeedItemCategorySnapshotReconciliation()
  if (result.hasMore) {
    await enqueueHardDeleteRssFeedSourcePage(data.rssFeedId)
  } else {
    await enqueueHardDeleteRssFeedChildPage(data.rssFeedId, firstChildPhase)
  }
}

export async function processHardDeleteRssFeedChildPage(data: {
  rssFeedId: string
  phase: RssFeedHardDeleteChildPhase
}): Promise<void> {
  const result = await hardDeleteRssFeedChildPage(data.rssFeedId, data.phase)
  if (result.hasMore) {
    await enqueueHardDeleteRssFeedChildPage(data.rssFeedId, data.phase)
    return
  }
  const next = RSS_FEED_HARD_DELETE_CHILD_PHASES.indexOf(data.phase) + 1
  const nextPhase = RSS_FEED_HARD_DELETE_CHILD_PHASES[next]
  if (nextPhase) await enqueueHardDeleteRssFeedChildPage(data.rssFeedId, nextPhase)
  else await enqueueFinalizeHardDeleteRssFeed(data.rssFeedId)
}

export async function processFinalizeHardDeleteRssFeed(data: { rssFeedId: string }): Promise<void> {
  const result = await finalizeHardDeleteRssFeed(data.rssFeedId)
  if (result.remaining === 'sources') {
    await enqueueHardDeleteRssFeedSourcePage(data.rssFeedId)
  } else if (result.remaining === 'admin_import_history') {
    // A reference appearing after the delete marker violates the insertion fence. Preserve history.
    throw new Error(`RSS feed ${data.rssFeedId} cannot be deleted: admin import history reference`)
  } else if (result.remaining) {
    await enqueueHardDeleteRssFeedChildPage(data.rssFeedId, result.remaining)
  }
}
