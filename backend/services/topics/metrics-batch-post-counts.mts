// Correlate each bounded scalar eligibility result to this relation row. With empty restore
// statistics, a flattenable EXISTS can multiply global root-post scans across unrelated posts.
function eligibleProbe(postIdSql: string, postType: string): string {
  return `(
        SELECT TRUE
        FROM view_public_post_eligibility eligibility
        WHERE eligibility.post_id = ${postIdSql}
          AND eligibility.post_type = '${postType}'
        LIMIT 1
      ) IS TRUE`
}

/** Each count is one index walk for that topic and stops after the probe. UNION keeps one row per post. */
export function topicCountLaterals(probeParam: string): string {
  return `
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS count
      FROM (
        (
          SELECT relation.subject_id AS post_id
          FROM relation__post__category__topic relation
          WHERE (CASE WHEN relation.deleted_at IS NULL AND relation.votes_score_net > 0 THEN relation.object_id END) = combined_ids.id
            AND relation.deleted_at IS NULL
            AND relation.votes_score_net > 0
            AND ${eligibleProbe('relation.subject_id', 'discussion')}
          ORDER BY relation.subject_id
          LIMIT ${probeParam}
        )
        UNION
        (
          SELECT page.post_id
          FROM topic_aliases alias
          JOIN LATERAL (
            SELECT alias_relation.subject_id AS post_id
            FROM relation__post__category__topic_alias alias_relation
            WHERE (CASE WHEN alias_relation.deleted_at IS NULL AND alias_relation.votes_score_net > 0 THEN alias_relation.object_id END) = alias.id
              AND alias_relation.deleted_at IS NULL
              AND alias_relation.votes_score_net > 0
              AND ${eligibleProbe('alias_relation.subject_id', 'discussion')}
            ORDER BY alias_relation.subject_id
            LIMIT ${probeParam}
          ) page ON TRUE
          WHERE alias.topic_id = combined_ids.id
          LIMIT ${probeParam}
        )
      ) discussion_posts
    ) discussion_counts ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT rating.post_id
        FROM post_review_topic_ratings rating
        WHERE rating.topic_id = combined_ids.id
          AND ${eligibleProbe('rating.post_id', 'review')}
        ORDER BY rating.post_id
        LIMIT ${probeParam}
      ) review_posts
    ) review_counts ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT mapping.post_id
        FROM post_data_point_topics mapping
        WHERE mapping.topic_id = combined_ids.id
          AND ${eligibleProbe('mapping.post_id', 'data_point')}
        ORDER BY mapping.post_id
        LIMIT ${probeParam}
      ) data_point_posts
    ) data_point_counts ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT bounded.rss_feed_item_id)::bigint AS count
      FROM (
        -- The LIMIT bounds the category rows read through the topic_id index. Eligibility
        -- is then checked only on those rows, so the count is capped, not exact.
        SELECT category.rss_feed_item_id
        FROM rss_feed_item_categories category
        WHERE category.topic_id = combined_ids.id
        ORDER BY category.rss_feed_item_id DESC, category.category_identity_id DESC
        LIMIT ${probeParam}
      ) bounded
      -- Scalar probes, not a join: a correlated EXISTS is flattened into a semi-join that can
      -- scan every enabled feed's sources instead of probing the bounded rows.
      WHERE (
        SELECT item.deleted_at IS NULL
        FROM rss_feed_items item
        WHERE item.id = bounded.rss_feed_item_id
      ) IS TRUE
        AND (
          SELECT TRUE
          FROM rss_feed_item_sources source
          WHERE source.rss_feed_item_id = bounded.rss_feed_item_id
            -- IS TRUE retains one hashed eligibility set instead of per-source feed probes.
            AND (source.rss_feed_id IN (
              SELECT feed.id
              FROM rss_feeds feed
              WHERE feed.deleted_at IS NULL
                AND feed.is_enabled
                AND feed.is_discoverable
            )) IS TRUE
          LIMIT 1
        ) IS TRUE
    ) news_counts ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT source.rss_feed_item_id AS item_id
        FROM (
          SELECT feed.id
          FROM rss_feeds feed
          WHERE feed.topic_id = combined_ids.id
            AND feed.deleted_at IS NULL
          ORDER BY feed.topic_id
          LIMIT 1
        ) topic_feed
        JOIN rss_feeds feed
          ON feed.id = topic_feed.id
         AND feed.is_enabled
         AND feed.is_discoverable
        JOIN LATERAL (
          SELECT source.rss_feed_item_id
          FROM rss_feed_item_sources source
          WHERE source.rss_feed_id = feed.id
            AND (
              SELECT item.deleted_at IS NULL
              FROM rss_feed_items item
              WHERE item.id = source.rss_feed_item_id
            ) IS TRUE
          ORDER BY source.rss_feed_item_id
          LIMIT ${probeParam}
        ) source ON TRUE
      ) page
    ) latest_counts ON TRUE`
}
