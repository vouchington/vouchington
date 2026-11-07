import sql, { type SQLStatement } from 'sql-template-strings'

type Target = 'rss_feed' | 'topic'
type Relation = 'follow' | 'mute'

/** Exact membership for one item child, including live visible proxy-list entries. */
export function buildViewerMembership(
  objectId: SQLStatement,
  relation: Relation,
  target: Target,
): SQLStatement {
  const directTable =
    relation === 'follow'
      ? target === 'rss_feed'
        ? 'relation__user__follow__rss_feed'
        : 'relation__user__follow__topic'
      : target === 'rss_feed'
        ? 'relation__user__mute__rss_feed'
        : 'relation__user__mute__topic'
  const proxyTable =
    relation === 'follow'
      ? 'relation__user__proxy_follow__community'
      : 'relation__user__proxy_mute__community'
  const listTable = target === 'rss_feed' ? 'community_list_rss_feeds' : 'community_list_topics'
  const listColumn = target === 'rss_feed' ? 'rss_feed_id' : 'topic_id'
  const hasProxyColumn = relation === 'follow' ? 'has_proxy_follow' : 'has_proxy_mute'
  const communityMembership =
    relation === 'follow'
      ? sql`(viewer.community_id IS NOT NULL AND COALESCE((SELECT TRUE FROM `
          .append(listTable)
          .append(sql` listing
      JOIN communities community ON community.id = listing.community_id
        AND community.deleted_at IS NULL
      WHERE listing.community_id = viewer.community_id AND listing.`)
          .append(listColumn)
          .append(sql` = `)
          .append(objectId)
          .append(sql` AND listing.removed_at IS NULL), FALSE))`)
      : sql`FALSE`
  const directMembership = sql`COALESCE((SELECT TRUE FROM `
    .append(directTable)
    .append(sql` direct_relation
    WHERE direct_relation.subject_id = viewer.user_id
      AND direct_relation.object_id = `)
    .append(objectId)
    .append(sql` AND direct_relation.deleted_at IS NULL), FALSE)`)
  const proxyMembership = sql`CASE WHEN viewer.`
    .append(hasProxyColumn)
    .append(sql` THEN COALESCE((SELECT TRUE FROM `)
    .append(proxyTable)
    .append(sql` proxy WHERE proxy.subject_id = viewer.user_id
      AND proxy.deleted_at IS NULL
      AND COALESCE((SELECT TRUE FROM `)
    .append(listTable)
    .append(sql` listing WHERE listing.community_id = proxy.object_id
        AND listing.`)
    .append(listColumn)
    .append(sql` = `)
    .append(objectId).append(sql` AND listing.removed_at IS NULL), FALSE)
      AND COALESCE((SELECT TRUE FROM communities community
        WHERE community.id = proxy.object_id AND community.deleted_at IS NULL
          AND (community.visibility = 'public' OR EXISTS (
            SELECT 1 FROM community_members member
            WHERE member.community_id = community.id
              AND member.user_id = viewer.user_id
              AND member.removed_at IS NULL))), FALSE)
    LIMIT 1), FALSE) ELSE FALSE END`)
  const userMembership = sql`(viewer.user_id IS NOT NULL`
    .append(relation === 'follow' ? sql` AND viewer.community_id IS NULL` : sql``)
    .append(sql` AND (`)
    .append(directMembership)
    .append(sql` OR `)
    .append(proxyMembership)
    .append(sql`))`)
  return sql`COALESCE((SELECT TRUE FROM viewer_scope viewer WHERE (`
    .append(communityMembership)
    .append(sql` OR `)
    .append(userMembership)
    .append(sql`)), FALSE)`)
}

export function buildActiveFollowedTopic(topicId: SQLStatement): SQLStatement {
  return sql`(COALESCE((SELECT TRUE FROM topics active_topic
    WHERE active_topic.id = `
    .append(topicId)
    .append(sql`
      AND active_topic.deleted_at IS NULL
      AND active_topic.merged_into_topic_id IS NULL), FALSE) AND `)
    .append(buildViewerMembership(topicId, 'follow', 'topic'))
    .append(sql`)`)
}

export function buildActiveFollowedRssFeed(feedId: SQLStatement): SQLStatement {
  return sql`(COALESCE((SELECT TRUE FROM rss_feeds active_feed
    WHERE active_feed.id = `
    .append(feedId)
    .append(sql`
      AND active_feed.is_enabled = TRUE AND active_feed.deleted_at IS NULL), FALSE) AND `)
    .append(buildViewerMembership(feedId, 'follow', 'rss_feed'))
    .append(sql`)`)
}
