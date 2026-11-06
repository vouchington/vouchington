import sql, { type SQLStatement } from 'sql-template-strings'

/** Every input stops after the sentinel row. An overflow suppresses the whole page. */
export function appendPersonalizedExclusionCTEs(
  query: SQLStatement,
  currentUserId: string | undefined,
  relationLimit: number,
): SQLStatement {
  const userId = currentUserId ?? '00000000-0000-0000-0000-000000000000'
  const probeLimit = relationLimit + 1
  return query.append(sql`
    direct_muted_topics_raw AS MATERIALIZED (
      SELECT object_id AS topic_id FROM relation__user__mute__topic
      WHERE subject_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC LIMIT ${probeLimit}
    ), direct_muted_feeds_raw AS MATERIALIZED (
      SELECT object_id AS rss_feed_id FROM relation__user__mute__rss_feed
      WHERE subject_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC LIMIT ${probeLimit}
    ), direct_muted_users_raw AS MATERIALIZED (
      SELECT object_id AS user_id FROM relation__user__mute__user
      WHERE subject_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC LIMIT ${probeLimit}
    ), direct_blocked_users_raw AS MATERIALIZED (
      SELECT object_id AS user_id FROM relation__user__block__user
      WHERE subject_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC LIMIT ${probeLimit}
    ), direct_hidden_items_raw AS MATERIALIZED (
      SELECT object_id AS rss_feed_item_id FROM relation__user__hide__rss_feed_item
      WHERE subject_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC LIMIT ${probeLimit}
    ), direct_blocked_hostnames_raw AS MATERIALIZED (
      SELECT object_id AS hostname_id FROM relation__user__block__url_hostname
      WHERE subject_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC LIMIT ${probeLimit}
    ), direct_muted_hostnames_raw AS MATERIALIZED (
      SELECT object_id AS hostname_id FROM relation__user__mute__url_hostname
      WHERE subject_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC LIMIT ${probeLimit}
    ), proxy_muted_communities_raw AS MATERIALIZED (
      SELECT relation.object_id AS community_id
      FROM relation__user__proxy_mute__community relation
      WHERE relation.subject_id = ${userId} AND relation.deleted_at IS NULL
      ORDER BY relation.created_at DESC, relation.object_id DESC LIMIT ${probeLimit}
    ), proxy_muted_topics_raw AS MATERIALIZED (
      SELECT proxy.community_id, child.topic_id
      FROM proxy_muted_communities_raw proxy
      JOIN communities community ON community.id = proxy.community_id
        AND community.deleted_at IS NULL
      CROSS JOIN LATERAL (
        SELECT topic_id FROM community_list_topics
        WHERE community_id = proxy.community_id AND removed_at IS NULL
        ORDER BY topic_id DESC LIMIT ${probeLimit}
      ) child
      WHERE community.visibility = 'public' OR EXISTS (
        SELECT 1 FROM community_members member
        WHERE member.community_id = community.id
          AND member.user_id = ${userId} AND member.removed_at IS NULL
      )
    ), proxy_muted_feeds_raw AS MATERIALIZED (
      SELECT proxy.community_id, child.rss_feed_id
      FROM proxy_muted_communities_raw proxy
      JOIN communities community ON community.id = proxy.community_id
        AND community.deleted_at IS NULL
      CROSS JOIN LATERAL (
        SELECT rss_feed_id FROM community_list_rss_feeds
        WHERE community_id = proxy.community_id AND removed_at IS NULL
        ORDER BY rss_feed_id DESC LIMIT ${probeLimit}
      ) child
      WHERE community.visibility = 'public' OR EXISTS (
        SELECT 1 FROM community_members member
        WHERE member.community_id = community.id
          AND member.user_id = ${userId} AND member.removed_at IS NULL
      )
    ), excluded_topics AS MATERIALIZED (
      SELECT topic_id FROM direct_muted_topics_raw
      UNION SELECT topic_id FROM proxy_muted_topics_raw
    ), excluded_rss_feeds AS MATERIALIZED (
      SELECT rss_feed_id FROM direct_muted_feeds_raw
      UNION SELECT rss_feed_id FROM proxy_muted_feeds_raw
    ), excluded_users AS MATERIALIZED (
      SELECT user_id FROM direct_muted_users_raw
      UNION SELECT user_id FROM direct_blocked_users_raw
    ), hidden_items AS MATERIALIZED (
      SELECT rss_feed_item_id FROM direct_hidden_items_raw
    ), excluded_hostnames AS MATERIALIZED (
      SELECT hostname.reversed_hostname
      FROM direct_blocked_hostnames_raw blocked
      JOIN url_hostnames hostname ON hostname.id = blocked.hostname_id
      UNION
      SELECT hostname.reversed_hostname
      FROM direct_muted_hostnames_raw muted
      JOIN url_hostnames hostname ON hostname.id = muted.hostname_id
    ), exclusion_budget_exhausted AS MATERIALIZED (
      SELECT (
        (SELECT COUNT(*) FROM direct_muted_topics_raw) > ${relationLimit}
        OR (SELECT COUNT(*) FROM direct_muted_feeds_raw) > ${relationLimit}
        OR (SELECT COUNT(*) FROM direct_muted_users_raw) > ${relationLimit}
        OR (SELECT COUNT(*) FROM direct_blocked_users_raw) > ${relationLimit}
        OR (SELECT COUNT(*) FROM direct_hidden_items_raw) > ${relationLimit}
        OR (SELECT COUNT(*) FROM direct_blocked_hostnames_raw) > ${relationLimit}
        OR (SELECT COUNT(*) FROM direct_muted_hostnames_raw) > ${relationLimit}
        OR (SELECT COUNT(*) FROM proxy_muted_communities_raw) > ${relationLimit}
        OR EXISTS (
          SELECT 1 FROM proxy_muted_topics_raw
          GROUP BY community_id HAVING COUNT(*) > ${relationLimit}
        )
        OR EXISTS (
          SELECT 1 FROM proxy_muted_feeds_raw
          GROUP BY community_id HAVING COUNT(*) > ${relationLimit}
        )
      ) AS exhausted
    )`)
}
