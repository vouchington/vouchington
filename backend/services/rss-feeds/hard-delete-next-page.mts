import { write, type QueryOptions } from '@data-stores/psql'
import {
  enqueueHardDeleteRssFeedSourcePages,
  enqueueHardDeleteRssFeedChildPages,
  enqueueHardDeleteRssFeedFinalizers,
} from '@queues/rss-feed-maintenance/enqueues/hard-delete'
import type { RssFeedHardDeleteChildPhase } from '@queues/rss-feed-maintenance/types'

type NextPage = {
  rss_feed_id: string
  phase: RssFeedHardDeleteChildPhase | 'sources' | 'finalize'
  cursor: string
}

/** Recovery and continuations share the first remaining raw key, never a stale start-page ID. */
export async function enqueueNextHardDeleteRssFeedPages(feedIds: readonly string[]): Promise<void> {
  if (feedIds.length === 0) return
  const rows = await listHardDeleteRssFeedNextPages(feedIds)
  await Promise.all([
    enqueueHardDeleteRssFeedSourcePages(
      rows.flatMap(row =>
        row.phase === 'sources' ? [{ rssFeedId: row.rss_feed_id, pageCursor: row.cursor }] : [],
      ),
    ),
    enqueueHardDeleteRssFeedChildPages(
      rows.flatMap(row =>
        row.phase === 'sources' || row.phase === 'finalize'
          ? []
          : [{ rssFeedId: row.rss_feed_id, pageCursor: row.cursor, phase: row.phase }],
      ),
    ),
    enqueueHardDeleteRssFeedFinalizers(
      rows.flatMap(row =>
        row.phase === 'finalize' ? [{ rssFeedId: row.rss_feed_id, pageCursor: row.cursor }] : [],
      ),
    ),
  ])
}

/** Each branch reads at most one existing indexed FK row for each bounded feed. */
export async function listHardDeleteRssFeedNextPages(
  feedIds: readonly string[],
  options: QueryOptions = {},
): Promise<NextPage[]> {
  if (feedIds.length === 0) return []
  const { rows } = await write<NextPage>(
    `/* enqueueNextHardDeleteRssFeedPages */
    SELECT feed.id AS rss_feed_id, work.phase, work.cursor
    FROM unnest($1::uuid[]) AS input(id)
    CROSS JOIN LATERAL (
      SELECT id FROM rss_feeds
      WHERE id = input.id AND hard_delete_requested_at IS NOT NULL LIMIT 1
    ) feed
    CROSS JOIN LATERAL (
      SELECT phase, cursor FROM (
        (SELECT 'sources' AS phase, rss_feed_item_id AS cursor, 0 AS ord
          FROM rss_feed_item_sources WHERE rss_feed_id = feed.id
          ORDER BY rss_feed_item_id LIMIT 1)
        UNION ALL
        (SELECT 'setting_changes' AS phase, id AS cursor, 1 AS ord
          FROM rss_feed_setting_changes WHERE rss_feed_id = feed.id
          ORDER BY change_type, id DESC LIMIT 1)
        UNION ALL
        (SELECT 'crawls' AS phase, id AS cursor, 2 AS ord
          FROM rss_feed_crawls WHERE rss_feed_id = feed.id AND id > feed.id
          ORDER BY id LIMIT 1)
        UNION ALL
        (SELECT 'community_list_feeds' AS phase, id AS cursor, 3 AS ord
          FROM community_list_rss_feeds WHERE rss_feed_id = feed.id
          ORDER BY id LIMIT 1)
        UNION ALL
        (SELECT 'curated_asides' AS phase, id AS cursor, 4 AS ord
          FROM curated_aside_items WHERE rss_feed_id = feed.id
          ORDER BY id LIMIT 1)
        UNION ALL
        (SELECT 'user_import_requests' AS phase, id AS cursor, 5 AS ord
          FROM user_import_requests WHERE rss_feed_id = feed.id
          ORDER BY id LIMIT 1)
        UNION ALL
        (SELECT 'feed_categories' AS phase, category_identity_id AS cursor, 6 AS ord
          FROM rss_feed_categories WHERE rss_feed_id = feed.id
          ORDER BY category_identity_id LIMIT 1)
        UNION ALL
        (SELECT 'canonical_redirects' AS phase, id AS cursor, 7 AS ord
          FROM rss_feeds WHERE canonical_rss_feed_id = feed.id
          ORDER BY id LIMIT 1)
        UNION ALL
        (SELECT 'user_import_rows' AS phase, id AS cursor, 8 AS ord
          FROM user_rss_feed_import_rows WHERE rss_feed_id = feed.id
          ORDER BY id LIMIT 1)
        UNION ALL
        SELECT 'finalize', feed.id, 9
      ) candidates ORDER BY ord LIMIT 1
    ) work`,
    [[...new Set(feedIds)]],
    options,
  )
  return rows
}
