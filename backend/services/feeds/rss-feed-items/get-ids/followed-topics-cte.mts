import sql, { type SQLStatement } from 'sql-template-strings'

export function buildFollowedTopicsCTE({
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
  const query = sql`/* buildFollowedCTE:fragment */ followed_topics AS (`
  if (communityId) {
    query.append(sql`
      SELECT raw.topic_id
      FROM (
        SELECT topic_id FROM community_list_topics
        WHERE community_id = ${communityId} AND removed_at IS NULL
        ORDER BY topic_id DESC LIMIT ${followInputLimit}
      ) raw
      JOIN communities community ON community.id = ${communityId} AND community.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT sort_at FROM rss_feed_item_topic_candidates candidate
        WHERE candidate.topic_id = raw.topic_id AND candidate.sort_at IS NOT NULL
        ORDER BY candidate.sort_at DESC, candidate.rss_feed_item_id DESC LIMIT 1
      ) latest ON TRUE
      ORDER BY latest.sort_at DESC NULLS LAST, raw.topic_id DESC
      LIMIT ${sourceLimit}`)
  } else if (currentUserId) {
    query.append(sql`
      SELECT topic_id FROM (
        SELECT direct.object_id AS topic_id
        FROM (
          SELECT object_id FROM relation__user__follow__topic
          WHERE subject_id = ${currentUserId} AND deleted_at IS NULL
          ORDER BY created_at DESC, object_id DESC LIMIT ${followInputLimit}
        ) direct
        UNION
        SELECT child.topic_id
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
            SELECT candidate.sort_at
            FROM (
              SELECT topic_id FROM community_list_topics
              WHERE community_id = proxy.community_id AND removed_at IS NULL
              ORDER BY topic_id DESC LIMIT ${followInputLimit}
            ) raw
            JOIN LATERAL (
              SELECT sort_at FROM rss_feed_item_topic_candidates candidate
              WHERE candidate.topic_id = raw.topic_id AND candidate.sort_at IS NOT NULL
              ORDER BY candidate.sort_at DESC, candidate.rss_feed_item_id DESC LIMIT 1
            ) candidate ON TRUE
            ORDER BY candidate.sort_at DESC LIMIT 1
          ) latest ON TRUE
          WHERE community.visibility = 'public' OR EXISTS (
            SELECT 1 FROM community_members member
            WHERE member.community_id = community.id
              AND member.user_id = ${currentUserId} AND member.removed_at IS NULL
          )
          ORDER BY latest.sort_at DESC NULLS LAST, proxy.community_id DESC
          LIMIT ${sourceLimit}
        ) proxy
        CROSS JOIN LATERAL (
          SELECT raw.topic_id
          FROM (
            SELECT topic_id FROM community_list_topics
            WHERE community_id = proxy.community_id AND removed_at IS NULL
            ORDER BY topic_id DESC LIMIT ${followInputLimit}
          ) raw
          LEFT JOIN LATERAL (
            SELECT sort_at FROM rss_feed_item_topic_candidates candidate
            WHERE candidate.topic_id = raw.topic_id AND candidate.sort_at IS NOT NULL
            ORDER BY candidate.sort_at DESC, candidate.rss_feed_item_id DESC LIMIT 1
          ) latest ON TRUE
          ORDER BY latest.sort_at DESC NULLS LAST, raw.topic_id DESC
          LIMIT ${sourceLimit}
        ) child
      ) combined`)
  } else query.append(sql` SELECT NULL::uuid AS topic_id WHERE false`)
  return query.append(sql` )`)
}
