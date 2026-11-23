import { listHardDeleteRssFeedNextPages } from './hard-delete-next-page.mts'
import { beginTransaction } from '@data-stores/psql'
import { markRssFeedItemCategorySnapshotsForReconciliation } from '@services/rss-feed-items/category-snapshot-reconciliations'
import {
  uniquePublicationKeys,
  type PublicationCapturedKey,
} from '@services/post-publication/captured-keys'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import { enqueueCapturedPublicationChangeAfterCommit } from '@services/post-publication/direct-capture'

export type HardDeleteRssFeedSourcePage = {
  removed: number
  hasMore: boolean
  keys: PublicationCapturedKey[]
}

/** One committed source-association page, with publication effects registered after commit. */
export async function hardDeleteRssFeedSourcePage(
  rssFeedId: string,
  expectedCursor?: string,
): Promise<HardDeleteRssFeedSourcePage> {
  const limit = getPostPublicationWorkLimit('rss_feed_hard_delete_capture_batch_size')
  await using query = await beginTransaction()
  const feed = await query<{ topic_id: string }>(
    `/* hardDeleteRssFeedSourcePage:feed */
    SELECT topic_id FROM rss_feeds
    WHERE id = $1::uuid AND hard_delete_requested_at IS NOT NULL`,
    [rssFeedId],
  )
  if (feed.rows.length === 0) {
    await query.commit()
    return { removed: 0, hasMore: false, keys: [] }
  }
  if (expectedCursor !== undefined) {
    const current = (await listHardDeleteRssFeedNextPages([rssFeedId], { query }))[0]
    if (current?.phase !== 'sources' || current.cursor !== expectedCursor) {
      await query.commit()
      return { removed: 0, hasMore: false, keys: [] }
    }
  }
  const sourcePage = await query<{ rss_feed_item_id: string }>(
    `/* hardDeleteRssFeedSourcePage:candidates */
    SELECT rss_feed_item_id FROM rss_feed_item_sources
    WHERE rss_feed_id = $1::uuid
    ORDER BY rss_feed_item_id
    LIMIT $2`,
    [rssFeedId, limit],
  )
  if (
    sourcePage.rows.length === 0 ||
    (expectedCursor !== undefined && sourcePage.rows[0]?.rss_feed_item_id !== expectedCursor)
  ) {
    await query.commit()
    return { removed: 0, hasMore: false, keys: [] }
  }
  const candidateIds = sourcePage.rows.map(row => row.rss_feed_item_id)
  // Source locks serialize overlapping pages.
  const sourceRows = await query<{ rss_feed_item_id: string }>(
    `/* hardDeleteRssFeedSourcePage:lockSources */
    SELECT rss_feed_item_id FROM rss_feed_item_sources
    WHERE rss_feed_id = $1::uuid AND rss_feed_item_id = ANY($2::uuid[])
    ORDER BY rss_feed_item_id FOR UPDATE`,
    [rssFeedId, candidateIds],
  )
  const itemIds = sourceRows.rows.map(row => row.rss_feed_item_id)
  // The item-owned categories remain until their existing reconciler compares all surviving
  // sources. It captures old topic/alias keys if that later removes a global category.
  await markRssFeedItemCategorySnapshotsForReconciliation(query, itemIds)
  await query(
    `/* hardDeleteRssFeedSourcePage:deleteSources */
    DELETE FROM rss_feed_item_sources
    WHERE rss_feed_id = $1::uuid AND rss_feed_item_id = ANY($2::uuid[])`,
    [rssFeedId, itemIds],
  )
  const linkedPosts = await query<{ post_id: string }>(
    `/* hardDeleteRssFeedSourcePage:storyPosts */
      SELECT story_post.post_id
      FROM rss_feed_items item
      JOIN story_posts story_post ON story_post.story_id = item.story_id
      WHERE item.id = ANY($1::uuid[])
      ORDER BY story_post.post_id`,
    [itemIds],
  )
  const keys = uniquePublicationKeys([
    ...itemIds.map(uuidValue => ({ kind: 'impact_rss_feed_item' as const, uuidValue })),
    ...linkedPosts.rows.map(row => ({ kind: 'impact_post' as const, uuidValue: row.post_id })),
  ])
  enqueueCapturedPublicationChangeAfterCommit(query, {
    scope: { type: 'rss_feed', rssFeedId },
    reason: 'rss_feed_source_changed',
    scopeStart: false,
    keys,
  })
  await query.commit()
  return { removed: itemIds.length, hasMore: sourcePage.rows.length === limit, keys }
}
