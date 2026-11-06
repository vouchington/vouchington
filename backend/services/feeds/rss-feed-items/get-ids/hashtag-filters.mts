import sql, { type SQLStatement } from 'sql-template-strings'

export function appendRssFeedItemHashtagFilters(
  query: SQLStatement,
  {
    aliasIds,
    hasUnknownHashtag,
    rssFeedItemId = sql`rss_feed_items.id`,
    topicIds,
    eligibilityChildLimit,
  }: {
    aliasIds: string[] | undefined
    hasUnknownHashtag: boolean | undefined
    rssFeedItemId?: SQLStatement
    topicIds: string[] | undefined
    eligibilityChildLimit: number
  },
): void {
  if (hasUnknownHashtag) query.append(sql` AND FALSE`)
  for (const topicId of [...new Set(topicIds ?? [])]) {
    query
      .append(sql`
      AND (
        SELECT COUNT(*) FROM (
          SELECT 1 FROM relation__rss_feed_item__category__topic relation
          WHERE relation.subject_id = `)
      .append(rssFeedItemId)
      .append(sql`
          ORDER BY relation.id DESC LIMIT ${eligibilityChildLimit + 1}
        ) bounded_direct_topics
      ) <= ${eligibilityChildLimit}
      AND (
        SELECT COUNT(*) FROM (
          SELECT 1 FROM rss_feed_item_topic_alias_candidates candidate
          WHERE candidate.rss_feed_item_id = `)
      .append(rssFeedItemId)
      .append(sql`
          ORDER BY candidate.topic_alias_id DESC LIMIT ${eligibilityChildLimit + 1}
        ) bounded_alias_topics
      ) <= ${eligibilityChildLimit}
      AND (
        EXISTS (
          SELECT 1 FROM (
            SELECT rss_feed_id FROM rss_feed_item_sources
            WHERE rss_feed_item_id = `)
      .append(rssFeedItemId)
      .append(sql`
            ORDER BY rss_feed_id DESC LIMIT ${eligibilityChildLimit}
          ) hashtag_sources
          JOIN rss_feeds hashtag_feeds ON hashtag_feeds.id = hashtag_sources.rss_feed_id
          WHERE hashtag_feeds.topic_id = ${topicId}
            AND hashtag_feeds.is_enabled = TRUE
            AND hashtag_feeds.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM (
            SELECT object_id, deleted_at, votes_score_net
            FROM relation__rss_feed_item__category__topic relation
            WHERE relation.subject_id = `)
      .append(rssFeedItemId)
      .append(sql`
            ORDER BY relation.id DESC LIMIT ${eligibilityChildLimit}
          ) direct_topic
          WHERE direct_topic.object_id = ${topicId}
            AND direct_topic.deleted_at IS NULL
            AND direct_topic.votes_score_net > 0
        )
        OR EXISTS (
          SELECT 1 FROM (
            SELECT topic_id FROM rss_feed_item_topic_alias_candidates candidate
            WHERE candidate.rss_feed_item_id = `)
      .append(rssFeedItemId).append(sql`
            ORDER BY candidate.topic_alias_id DESC LIMIT ${eligibilityChildLimit}
          ) alias_topic
          WHERE alias_topic.topic_id = ${topicId}
        )
      )`)
  }
  for (const aliasId of [...new Set(aliasIds ?? [])]) {
    query
      .append(sql`
      AND EXISTS (
        SELECT 1 FROM rss_feed_item_topic_alias_candidates candidate
        WHERE candidate.rss_feed_item_id = `)
      .append(rssFeedItemId).append(sql`
          AND candidate.topic_alias_id = ${aliasId}
        LIMIT 1
      )`)
  }
}
