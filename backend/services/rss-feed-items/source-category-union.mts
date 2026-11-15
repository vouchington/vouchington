import { write } from '@data-stores/psql'
import { getRssFeedItemsWorkLimit } from './work-limits.mts'
import { normalizeRssFeedItemCategories } from './processing-limits.mts'

/** Inspect one source page, including removed feeds so rejection cannot extend the scan. */
export async function getRssFeedItemCategorySnapshotPage(
  rssFeedItemId: string,
  afterFeedId: string | null,
  accumulated: readonly string[] = [],
): Promise<{ categories: string[]; afterFeedId: string | null }> {
  const limit = getRssFeedItemsWorkLimit('category_snapshot_reconciliation_batch_size')
  const { rows } = await write<{
    rss_feed_id: string
    categories: string[]
    is_live: boolean | null
  }>(
    `/* getRssFeedItemCategorySnapshotPage */
      SELECT snapshot.rss_feed_id, snapshot.categories,
        (SELECT feed.deleted_at IS NULL FROM rss_feeds feed WHERE feed.id = snapshot.rss_feed_id) AS is_live
      FROM rss_feed_item_source_category_snapshots snapshot
      WHERE snapshot.rss_feed_item_id = $1::uuid
        AND snapshot.rss_feed_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY snapshot.rss_feed_id LIMIT $3`,
    [rssFeedItemId, afterFeedId, limit + 1],
  )
  const page = rows.slice(0, limit)
  const categories = [
    ...accumulated,
    ...page.flatMap(row => (row.is_live === true ? row.categories : [])),
  ]
  // Keep PostgreSQL's category collation and authored-case choice across page boundaries.
  const sorted = await write<{ category_text: string }>(
    `/* sortRssFeedItemCategorySnapshotPage */
      SELECT DISTINCT category_text FROM unnest($1::text[]) category(category_text)
      ORDER BY category_text`,
    [categories],
  )
  return {
    categories: normalizeRssFeedItemCategories(sorted.rows.map(row => row.category_text)),
    afterFeedId: rows.length > limit ? page.at(-1)!.rss_feed_id : null,
  }
}
