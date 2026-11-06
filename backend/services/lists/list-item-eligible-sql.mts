import { listPostDiscoveryFilter } from './listable.mts'
import sql, { type SQLStatement } from 'sql-template-strings'

/** Visibility of one already-limited list membership row. Missing targets are ineligible. */
export function listItemEligibleSql(options: {
  mediaType?: string
  read?: boolean
  currentUserId?: string
  isAdministrator?: boolean
}): SQLStatement {
  const statement = sql`(
      (
        page.item_type = 'post'
        AND candidate_post.id IS NOT NULL
        AND root_post.id IS NOT NULL
        AND `
  statement.append(listPostDiscoveryFilter(options.currentUserId, options.isAdministrator === true))
  statement.append(sql`
      )
      OR (
        page.item_type = 'rss_feed_item'
        AND rfi.id IS NOT NULL
        AND rfi.deleted_at IS NULL
        AND article_url.id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM rss_feed_item_sources source
          JOIN rss_feeds feed ON feed.id = source.rss_feed_id
            AND feed.deleted_at IS NULL AND feed.is_enabled = true
          WHERE source.rss_feed_item_id = rfi.id
        )
      )
    )`)
  if (options.mediaType) {
    statement.append(sql` AND rfi.media_type::text = ${options.mediaType}`)
  }
  if (options.read !== undefined && options.currentUserId) {
    const userId = options.currentUserId
    const readExists = sql`(
      CASE
        WHEN page.item_type = 'rss_feed_item' THEN EXISTS (
          SELECT 1 FROM rss_feed_item_read_states
          WHERE user_id = ${userId}::uuid AND rss_feed_item_id = page.entity_id)
        WHEN page.item_type = 'post' THEN EXISTS (
          SELECT 1 FROM post_read_states
          WHERE user_id = ${userId}::uuid AND post_id = page.entity_id)
        ELSE FALSE
      END
    )`
    statement.append(options.read ? sql` AND ` : sql` AND NOT `).append(readExists)
  }
  return statement
}
