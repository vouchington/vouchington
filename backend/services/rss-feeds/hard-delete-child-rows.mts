import type { TransactionQuery } from '@data-stores/psql'
import type { RssFeedHardDeleteChildPhase } from '@queues/rss-feed-maintenance/types'

export type HardDeleteChildRow = {
  id: string
  topic_id: string | null
  community_id: string | null
  user_id: string | null
}

/** Static lock queries let PostgreSQL and the lock-order checker see every FK child path. */
export async function lockHardDeleteRssFeedChildRows(
  query: TransactionQuery,
  feedId: string,
  phase: RssFeedHardDeleteChildPhase,
  limit: number,
): Promise<HardDeleteChildRow[]> {
  switch (phase) {
    case 'setting_changes':
      return (
        await query<HardDeleteChildRow>(
          `/* hardDeleteRssFeedChildPage:settingChanges */
        SELECT id, NULL::uuid AS topic_id, NULL::uuid AS community_id, NULL::uuid AS user_id
        FROM rss_feed_setting_changes WHERE rss_feed_id = $1::uuid
        ORDER BY change_type, id DESC LIMIT $2 FOR UPDATE`,
          [feedId, limit],
        )
      ).rows
    case 'crawls':
      return (
        await query<HardDeleteChildRow>(
          `/* hardDeleteRssFeedChildPage:crawls */
        SELECT id, NULL::uuid AS topic_id, NULL::uuid AS community_id, NULL::uuid AS user_id
        FROM rss_feed_crawls WHERE rss_feed_id = $1::uuid AND id > $1::uuid
        ORDER BY id LIMIT $2 FOR UPDATE`,
          [feedId, limit],
        )
      ).rows
    case 'community_list_feeds':
      return (
        await query<HardDeleteChildRow>(
          `/* hardDeleteRssFeedChildPage:communityLists */
        SELECT id, NULL::uuid AS topic_id, community_id, NULL::uuid AS user_id
        FROM community_list_rss_feeds WHERE rss_feed_id = $1::uuid
        ORDER BY id LIMIT $2 FOR UPDATE`,
          [feedId, limit],
        )
      ).rows
    case 'curated_asides':
      return (
        await query<HardDeleteChildRow>(
          `/* hardDeleteRssFeedChildPage:curatedAsides */
        SELECT id, topic_id, community_id, NULL::uuid AS user_id
        FROM curated_aside_items WHERE rss_feed_id = $1::uuid
        ORDER BY id LIMIT $2 FOR UPDATE`,
          [feedId, limit],
        )
      ).rows
    case 'user_import_requests':
      return (
        await query<HardDeleteChildRow>(
          `/* hardDeleteRssFeedChildPage:userImportRequests */
        SELECT id, NULL::uuid AS topic_id, NULL::uuid AS community_id, user_id
        FROM user_import_requests WHERE rss_feed_id = $1::uuid
        ORDER BY id LIMIT $2 FOR UPDATE`,
          [feedId, limit],
        )
      ).rows
    case 'feed_categories':
      return (
        await query<HardDeleteChildRow>(
          `/* hardDeleteRssFeedChildPage:feedCategories */
        SELECT category_identity_id AS id, topic_id, NULL::uuid AS community_id,
          NULL::uuid AS user_id FROM rss_feed_categories WHERE rss_feed_id = $1::uuid
        ORDER BY category_identity_id LIMIT $2 FOR UPDATE`,
          [feedId, limit],
        )
      ).rows
    case 'canonical_redirects':
      return (
        await query<HardDeleteChildRow>(
          `/* hardDeleteRssFeedChildPage:canonicalRedirects */
        SELECT id, topic_id, NULL::uuid AS community_id, NULL::uuid AS user_id
        FROM rss_feeds WHERE canonical_rss_feed_id = $1::uuid
        ORDER BY id LIMIT $2 FOR UPDATE`,
          [feedId, limit],
        )
      ).rows
    case 'user_import_rows':
      return (
        await query<HardDeleteChildRow>(
          `/* hardDeleteRssFeedChildPage:userImportRows */
        SELECT id, NULL::uuid AS topic_id, NULL::uuid AS community_id, NULL::uuid AS user_id
        FROM user_rss_feed_import_rows WHERE rss_feed_id = $1::uuid
        ORDER BY id LIMIT $2 FOR UPDATE`,
          [feedId, limit],
        )
      ).rows
  }
}
