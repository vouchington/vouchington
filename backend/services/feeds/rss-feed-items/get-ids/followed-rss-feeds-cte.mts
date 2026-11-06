import sql, { type SQLStatement } from 'sql-template-strings'

export function buildFollowedRssFeedsCTE({
  communityId,
  currentUserId,
  followInputLimit,
  sourceLimit,
}: {
  communityId?: string
  currentUserId?: string
  followInputLimit: number
  sourceLimit: number
}): SQLStatement {
  const query = sql`/* buildFollowedCTE:fragment */ followed_rss_feeds AS (`
  if (communityId) {
    query.append(sql`
      SELECT picked.id AS rss_feed_id
      FROM (
        SELECT rss_feed_id FROM community_list_rss_feeds
        WHERE community_id = ${communityId} AND removed_at IS NULL
        ORDER BY rss_feed_id DESC LIMIT ${followInputLimit}
      ) raw
      JOIN rss_feeds picked ON picked.id = raw.rss_feed_id
        AND picked.is_enabled = TRUE AND picked.deleted_at IS NULL
      JOIN communities community ON community.id = ${communityId} AND community.deleted_at IS NULL
      ORDER BY picked.latest_item_sort_at DESC NULLS LAST, picked.id DESC
      LIMIT ${sourceLimit}`)
  } else if (currentUserId) {
    query.append(sql`
      SELECT rss_feed_id FROM (
        SELECT direct.object_id AS rss_feed_id
        FROM (
          SELECT object_id FROM relation__user__follow__rss_feed
          WHERE subject_id = ${currentUserId} AND deleted_at IS NULL
          ORDER BY created_at DESC, object_id DESC LIMIT ${followInputLimit}
        ) direct
        UNION
        SELECT child.rss_feed_id
        FROM (
          SELECT proxy.community_id
          FROM (
            SELECT object_id AS community_id
            FROM relation__user__proxy_follow__community
            WHERE subject_id = ${currentUserId} AND deleted_at IS NULL
            ORDER BY created_at DESC, object_id DESC LIMIT ${followInputLimit}
          ) proxy
          JOIN communities community ON community.id = proxy.community_id
            AND community.deleted_at IS NULL
          LEFT JOIN LATERAL (
            SELECT feed.latest_item_sort_at
            FROM (
              SELECT rss_feed_id FROM community_list_rss_feeds
              WHERE community_id = proxy.community_id AND removed_at IS NULL
              ORDER BY rss_feed_id DESC LIMIT ${followInputLimit}
            ) raw
            JOIN rss_feeds feed ON feed.id = raw.rss_feed_id
              AND feed.is_enabled = TRUE AND feed.deleted_at IS NULL
            ORDER BY feed.latest_item_sort_at DESC NULLS LAST, feed.id DESC
            LIMIT 1
          ) latest ON TRUE
          WHERE community.visibility = 'public' OR EXISTS (
            SELECT 1 FROM community_members member
            WHERE member.community_id = community.id
              AND member.user_id = ${currentUserId} AND member.removed_at IS NULL
          )
          ORDER BY latest.latest_item_sort_at DESC NULLS LAST, proxy.community_id DESC
          LIMIT ${sourceLimit}
        ) proxy
        CROSS JOIN LATERAL (
          SELECT feed.id AS rss_feed_id
          FROM (
            SELECT rss_feed_id FROM community_list_rss_feeds
            WHERE community_id = proxy.community_id AND removed_at IS NULL
            ORDER BY rss_feed_id DESC LIMIT ${followInputLimit}
          ) raw
          JOIN rss_feeds feed ON feed.id = raw.rss_feed_id
            AND feed.is_enabled = TRUE AND feed.deleted_at IS NULL
          ORDER BY feed.latest_item_sort_at DESC NULLS LAST, feed.id DESC
          LIMIT ${sourceLimit}
        ) child
      ) combined`)
  } else query.append(sql` SELECT NULL::uuid AS rss_feed_id WHERE false`)
  return query.append(sql` )`)
}
