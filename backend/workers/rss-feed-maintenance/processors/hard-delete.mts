import { hardDeleteRssFeedSourcePage } from '@services/rss-feeds/hard-delete-source-page'
import { hardDeleteRssFeedChildPage } from '@services/rss-feeds/hard-delete-child-page'
import { finalizeHardDeleteRssFeed } from '@services/rss-feeds/hard-delete-finalize'
import { enqueueNextHardDeleteRssFeedPages } from '@services/rss-feeds/hard-delete-next-page'
import { enqueueContinueRssFeedItemCategorySnapshotReconciliation } from '@queues/rss-feed-maintenance/enqueues/item-categories'
import type {
  RssFeedHardDeleteChildPhase,
  RssFeedHardDeletePageData,
} from '@queues/rss-feed-maintenance/types'

/** The source precondition and deletion commit under one feed lock. */
export async function processHardDeleteRssFeedSourcePage(
  data: RssFeedHardDeletePageData,
): Promise<void> {
  const result = await hardDeleteRssFeedSourcePage(data.rssFeedId, data.pageCursor)
  if (result.removed > 0) await enqueueContinueRssFeedItemCategorySnapshotReconciliation()
  await enqueueNextHardDeleteRssFeedPages([data.rssFeedId])
}

export async function processHardDeleteRssFeedChildPage(
  data: RssFeedHardDeletePageData & { phase: RssFeedHardDeleteChildPhase },
): Promise<void> {
  const result = await hardDeleteRssFeedChildPage(data.rssFeedId, data.phase, data.pageCursor)
  if (result.hasMore && result.removed === 0)
    throw new Error('RSS child footprint changed; retry the same page')
  await enqueueNextHardDeleteRssFeedPages([data.rssFeedId])
}

export async function processFinalizeHardDeleteRssFeed(data: { rssFeedId: string }): Promise<void> {
  const result = await finalizeHardDeleteRssFeed(data.rssFeedId)
  if (result.remaining && result.remaining !== 'admin_import_history')
    await enqueueNextHardDeleteRssFeedPages([data.rssFeedId])
}
