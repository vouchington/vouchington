import { getPostsWorkLimit, postsWorkMaxValues } from '@services/posts/work-limits'
import sql, { type SQLStatement } from 'sql-template-strings'

/** Inlined so a generic plan sees the same owner-probe LIMIT as a custom plan. */
function ownerProbeLimitLiteral(value: number): string {
  const max = postsWorkMaxValues.story_source_owner_probe_limit
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error('story owner probe limit is outside its configured bound')
  }
  return String(value)
}

/**
 * Newest visible source in the capped index slice owns the story.
 * When that slice has no visible owner, this source row owns it.
 */
export function appendStoryOwnership(query: SQLStatement, staff: boolean): void {
  const probeLimit = ownerProbeLimitLiteral(getPostsWorkLimit('story_source_owner_probe_limit'))
  query.append(sql`
    sources AS (
      SELECT source_rows.feed_id, source_rows.feed_ord, source_rows.item_id,
        source_rows.published_at, source_rows.phase, source_rows.child_rank,
        CASE
          WHEN source_rows.story_post_id IS NOT NULL
           AND (
             owner.feed_id IS NULL
             OR (
               owner.feed_id = source_rows.feed_id
               AND owner.item_id = source_rows.item_id
             )
           )
          THEN source_rows.story_post_id ELSE NULL
        END AS post_id
      FROM source_rows
      LEFT JOIN LATERAL (
        SELECT visible.feed_id, visible.item_id
        FROM (SELECT 1 AS present WHERE source_rows.story_post_id IS NOT NULL) wanted
        JOIN LATERAL (
          SELECT ranked.feed_id, ranked.item_id
          FROM (
            SELECT owner_src.rss_feed_id AS feed_id, owner_src.rss_feed_item_id AS item_id
            FROM rss_feed_item_sources owner_src
            WHERE owner_src.story_id = source_rows.story_id
              AND owner_src.rss_feed_id >= source_rows.feed_id
            ORDER BY owner_src.rss_feed_id DESC, owner_src.rss_feed_item_id DESC
            LIMIT `)
  query.append(probeLimit)
  query.append(sql`
          ) ranked
          JOIN rss_feed_items owner_item
            ON owner_item.id = ranked.item_id
           AND owner_item.deleted_at IS NULL
          JOIN rss_feeds owner_feed
            ON owner_feed.id = ranked.feed_id
           AND owner_feed.deleted_at IS NULL`)
  if (!staff) {
    query.append(sql`
           AND owner_feed.is_enabled AND owner_feed.is_discoverable`)
  }
  query.append(sql`
          ORDER BY ranked.feed_id DESC, ranked.item_id DESC
          LIMIT 1
        ) visible ON TRUE
      ) owner ON TRUE
    )`)
}
