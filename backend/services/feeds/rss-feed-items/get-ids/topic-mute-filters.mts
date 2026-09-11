import sql, { type SQLStatement } from 'sql-template-strings'

export function appendRssFeedItemTopicMuteFilters(
  query: SQLStatement,
  rssFeedItemId: SQLStatement = sql`rss_feed_items.id`,
): void {
  query
    .append(sql`
    AND NOT EXISTS (
      SELECT 1
      FROM rss_feed_item_categories muted_category
      JOIN excluded_topics ON excluded_topics.topic_id = muted_category.topic_id
      WHERE muted_category.rss_feed_item_id = `)
    .append(rssFeedItemId)
    .append(sql`
    )
    AND NOT EXISTS (
      SELECT 1
      FROM relation__rss_feed_item__category__topic muted_topic
      JOIN excluded_topics ON excluded_topics.topic_id = muted_topic.object_id
      WHERE muted_topic.subject_id = `)
    .append(rssFeedItemId)
    .append(sql`
        AND muted_topic.deleted_at IS NULL
        AND muted_topic.votes_score_net > 0
    )
    AND NOT EXISTS (
      SELECT 1
      FROM relation__rss_feed_item__category__topic_alias muted_alias
      JOIN topic_aliases alias ON alias.id = muted_alias.object_id
      JOIN excluded_topics ON excluded_topics.topic_id = alias.topic_id
      WHERE muted_alias.subject_id = `)
    .append(rssFeedItemId).append(sql`
        AND muted_alias.deleted_at IS NULL
        AND muted_alias.votes_score_net > 0
    )
  `)
}
