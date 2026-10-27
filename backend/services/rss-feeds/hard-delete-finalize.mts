import { insertRssFeedStateChanges } from './state-changes.mts'
import { beginTransaction } from '@data-stores/psql'
import { lockPostPublicationRssFeedScopes } from '@services/post-publication/capture-rss-feeds'
import { enqueueCapturedPublicationChangeAfterCommit } from '@services/post-publication/direct-capture'
import type { RssFeedHardDeleteChildPhase } from '@queues/rss-feed-maintenance/types'
import { withTopicReferenceAttachmentFences } from '@services/post-publication/lock'

type RemainingPhase = RssFeedHardDeleteChildPhase | 'sources' | 'admin_import_history'

/** Final parent deletion only after all high-cardinality FK children are drained. */
export async function finalizeHardDeleteRssFeed(
  rssFeedId: string,
): Promise<{ deleted: boolean; remaining: RemainingPhase | null }> {
  await using query = await beginTransaction()
  const { rows: footprint } = await query<{ topic_id: string }>(
    `/* finalizeHardDeleteRssFeed:topicFootprint */
    SELECT topic_id FROM rss_feeds WHERE id = $1::uuid AND hard_delete_requested_at IS NOT NULL`,
    [rssFeedId],
  )
  if (footprint[0]) {
    await withTopicReferenceAttachmentFences([footprint[0].topic_id], { query }, async () => {})
  }
  await lockPostPublicationRssFeedScopes(query, [rssFeedId])
  const { rows: feeds } = await query<{ topic_id: string }>(
    `/* finalizeHardDeleteRssFeed:feed */
     SELECT topic_id FROM rss_feeds WHERE id = $1::uuid AND hard_delete_requested_at IS NOT NULL FOR UPDATE`,
    [rssFeedId],
  )
  if (feeds.length === 0) {
    await query.commit()
    return { deleted: false, remaining: null }
  }
  if (feeds[0]!.topic_id !== footprint[0]?.topic_id) {
    await query.commit()
    return { deleted: false, remaining: 'feed_categories' }
  }
  // Each EXISTS uses the feed FK's existing index and stops at one row.
  const { rows: pending } = await query<{ phase: RemainingPhase }>(
    `/* finalizeHardDeleteRssFeed:remaining */
    SELECT phase FROM (
      SELECT 'sources' AS phase, 0 AS ord WHERE EXISTS (SELECT 1 FROM rss_feed_item_sources WHERE rss_feed_id = $1::uuid)
      UNION ALL SELECT 'setting_changes', 1 WHERE EXISTS (SELECT 1 FROM rss_feed_setting_changes WHERE rss_feed_id = $1::uuid)
      UNION ALL SELECT 'crawls', 2 WHERE EXISTS (SELECT 1 FROM rss_feed_crawls WHERE rss_feed_id = $1::uuid AND id > $1::uuid)
      UNION ALL SELECT 'community_list_feeds', 3 WHERE EXISTS (SELECT 1 FROM community_list_rss_feeds WHERE rss_feed_id = $1::uuid)
      UNION ALL SELECT 'curated_asides', 4 WHERE EXISTS (SELECT 1 FROM curated_aside_items WHERE rss_feed_id = $1::uuid)
      UNION ALL SELECT 'user_import_requests', 5 WHERE EXISTS (SELECT 1 FROM user_import_requests WHERE rss_feed_id = $1::uuid)
      UNION ALL SELECT 'feed_categories', 6 WHERE EXISTS (SELECT 1 FROM rss_feed_categories WHERE rss_feed_id = $1::uuid)
      UNION ALL SELECT 'canonical_redirects', 7 WHERE EXISTS (SELECT 1 FROM rss_feeds WHERE canonical_rss_feed_id = $1::uuid)
      UNION ALL SELECT 'user_import_rows', 8 WHERE EXISTS (SELECT 1 FROM user_rss_feed_import_rows WHERE rss_feed_id = $1::uuid)
      UNION ALL SELECT 'admin_import_history', 9 WHERE EXISTS (SELECT 1 FROM admin_import_rows WHERE rss_feed_id = $1::uuid)
    ) remaining ORDER BY ord LIMIT 1`,
    [rssFeedId],
  )
  if (pending[0]?.phase === 'admin_import_history') {
    await query(
      `/* finalizeHardDeleteRssFeed:park */
      UPDATE rss_feeds SET hard_delete_requested_at = NULL
      WHERE id = $1::uuid`,
      [rssFeedId],
    )
    await insertRssFeedStateChanges(
      rssFeedId,
      [
        {
          kind: 'enablement',
          is_enabled: false,
          reason: 'Hard delete stopped: retained admin import history',
        },
      ],
      null,
      { query },
    )
  }
  if (pending[0]) {
    await query.commit()
    return { deleted: false, remaining: pending[0].phase }
  }
  enqueueCapturedPublicationChangeAfterCommit(query, {
    scope: { type: 'rss_feed', rssFeedId },
    reason: 'rss_feed_source_changed',
    keys: [
      { kind: 'identity_rss_feed', uuidValue: rssFeedId },
      { kind: 'impact_topic', uuidValue: feeds[0]!.topic_id },
    ],
  })
  await query(
    `/* finalizeHardDeleteRssFeed:delete */
     DELETE FROM rss_feeds WHERE id = $1::uuid AND hard_delete_requested_at IS NOT NULL`,
    [rssFeedId],
  )
  await query.commit()
  return { deleted: true, remaining: null }
}
