import sql, { type SQLStatement } from 'sql-template-strings'

export function buildCommunityListProxyFollowedTopicsCTE(userId: string): SQLStatement {
  return sql`/* buildCommunityListProxyFollowedTopicsCTE:fragment */
    SELECT clit.topic_id
    FROM community_list_items__topics clit
    JOIN relation__user__proxy_follow__community r ON r.object_id = clit.community_id
    JOIN communities c ON c.id = clit.community_id AND c.deleted_at IS NULL
    WHERE r.subject_id = ${userId} AND r.deleted_at IS NULL AND clit.removed_at IS NULL
      AND (c.visibility = 'public' OR EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.community_id = c.id AND cm.user_id = ${userId} AND cm.removed_at IS NULL
      ))`
}

export function buildCommunityListTopicsCTE(communityId: string): SQLStatement {
  return sql`/* buildCommunityListTopicsCTE:fragment */
    SELECT clit.topic_id
    FROM community_list_items__topics clit
    JOIN communities c ON c.id = clit.community_id AND c.deleted_at IS NULL
    WHERE clit.community_id = ${communityId}
      AND clit.removed_at IS NULL`
}

export function buildCommunityListProxyFollowedRssFeedsCTE(userId: string): SQLStatement {
  return sql`/* buildCommunityListProxyFollowedRssFeedsCTE:fragment */
    SELECT clir.rss_feed_id
    FROM community_list_items__rss_feeds clir
    JOIN relation__user__proxy_follow__community r ON r.object_id = clir.community_id
    JOIN communities c ON c.id = clir.community_id AND c.deleted_at IS NULL
    WHERE r.subject_id = ${userId} AND r.deleted_at IS NULL AND clir.removed_at IS NULL
      AND (c.visibility = 'public' OR EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.community_id = c.id AND cm.user_id = ${userId} AND cm.removed_at IS NULL
      ))`
}

export function buildCommunityListRssFeedsCTE(communityId: string): SQLStatement {
  return sql`/* buildCommunityListRssFeedsCTE:fragment */
    SELECT clir.rss_feed_id
    FROM community_list_items__rss_feeds clir
    JOIN communities c ON c.id = clir.community_id AND c.deleted_at IS NULL
    WHERE clir.community_id = ${communityId}
      AND clir.removed_at IS NULL`
}

export function buildCommunityListProxyMutedTopicsCTE(userId: string): SQLStatement {
  return sql`/* buildCommunityListProxyMutedTopicsCTE:fragment */
    SELECT clit.topic_id
    FROM community_list_items__topics clit
    JOIN relation__user__proxy_mute__community r ON r.object_id = clit.community_id
    JOIN communities c ON c.id = clit.community_id AND c.deleted_at IS NULL
    WHERE r.subject_id = ${userId} AND r.deleted_at IS NULL AND clit.removed_at IS NULL
      AND (c.visibility = 'public' OR EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.community_id = c.id AND cm.user_id = ${userId} AND cm.removed_at IS NULL
      ))`
}

export function buildCommunityListProxyMutedRssFeedsCTE(userId: string): SQLStatement {
  return sql`/* buildCommunityListProxyMutedRssFeedsCTE:fragment */
    SELECT clir.rss_feed_id
    FROM community_list_items__rss_feeds clir
    JOIN relation__user__proxy_mute__community r ON r.object_id = clir.community_id
    JOIN communities c ON c.id = clir.community_id AND c.deleted_at IS NULL
    WHERE r.subject_id = ${userId} AND r.deleted_at IS NULL AND clir.removed_at IS NULL
      AND (c.visibility = 'public' OR EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.community_id = c.id AND cm.user_id = ${userId} AND cm.removed_at IS NULL
      ))`
}
