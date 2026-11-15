import { write } from '@data-stores/psql'
import { enqueueBulkReconcileRssFeedItemNotifications } from '@queues/notifications/enqueues'
import type {
  RssFeedItemCategorySourcePage,
  RssFeedItemCategoryParentCursor,
} from '@queues/rss-feed-maintenance/types'
import { getRssFeedItemCategorySnapshotPage } from './source-category-union.mts'
import { upsertRssFeedItemCategories } from './categories.mts'

export type CategorySnapshotPageResult = {
  reconciled: number
  sourcePages?: RssFeedItemCategorySourcePage[]
  after?: RssFeedItemCategoryParentCursor
}

/** A source or stale-category continuation never acknowledges a partially projected generation. */
export async function reconcileRssFeedItemCategorySourcePage(
  page: RssFeedItemCategorySourcePage,
): Promise<CategorySnapshotPageResult> {
  if (!(await isCurrentSourcePage(page))) return { reconciled: 1 }
  const source =
    page.phase === 'sources'
      ? await getRssFeedItemCategorySnapshotPage(
          page.rssFeedItemId,
          page.afterFeedId,
          page.categories,
        )
      : { categories: page.categories, afterFeedId: null }
  if (source.afterFeedId) {
    return {
      reconciled: 0,
      sourcePages: [{ ...page, categories: source.categories, afterFeedId: source.afterFeedId }],
    }
  }
  const snapshot = {
    rss_feed_item_id: page.rssFeedItemId,
    categories: source.categories,
    source_union_categories: source.categories,
    change_id: page.changeId,
    generation: page.generation,
  }
  const complete = await upsertRssFeedItemCategories([snapshot], snapshot)
  if (!complete) {
    if (!(await isCurrentSourcePage(page))) return { reconciled: 1 }
    return {
      reconciled: 0,
      sourcePages: [
        { ...page, phase: 'project', categories: source.categories, afterFeedId: null },
      ],
    }
  }
  // Notification admission must settle before the exact completed generation is acknowledged.
  await enqueueBulkReconcileRssFeedItemNotifications([page.rssFeedItemId], page.changeId)
  await write(
    `/* acknowledgeRssFeedItemCategorySnapshot */
      DELETE FROM rss_feed_item_category_snapshot_reconciliations
      WHERE rss_feed_item_id = $1::uuid AND generation = $2::bigint AND change_id = $3::uuid
      RETURNING rss_feed_item_id`,
    [page.rssFeedItemId, page.generation, page.changeId],
  )
  return { reconciled: 1 }
}

async function isCurrentSourcePage(page: RssFeedItemCategorySourcePage): Promise<boolean> {
  const { rows } = await write<{ rss_feed_item_id: string; categories: unknown }>(
    `/* readRssFeedItemCategorySourcePageGeneration */
      SELECT rss_feed_item_id, categories FROM rss_feed_item_category_snapshot_reconciliations
      WHERE rss_feed_item_id = $1::uuid AND change_id = $2::uuid AND generation = $3::bigint`,
    [page.rssFeedItemId, page.changeId, page.generation],
  )
  const row = rows[0]
  if (!row) return false
  if (
    !Array.isArray(row.categories) ||
    row.categories.some(category => typeof category !== 'string')
  )
    throw new TypeError('RSS feed item category snapshot categories must be strings')
  return true
}
