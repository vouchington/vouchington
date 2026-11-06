import sql, { type SQLStatement } from 'sql-template-strings'

export function appendRssFeedItemTopicMuteFilters(
  query: SQLStatement,
  rssFeedItemId: SQLStatement,
): void {
  query
    .append(sql` AND NOT EXISTS (
    SELECT 1 FROM rss_feed_item_categories category
    JOIN excluded_topics excluded ON excluded.topic_id = category.topic_id
    WHERE category.rss_feed_item_id = `)
    .append(rssFeedItemId)
    .append(sql`
  ) AND NOT EXISTS (
    SELECT 1 FROM relation__rss_feed_item__category__topic relation
    JOIN excluded_topics excluded ON excluded.topic_id = relation.object_id
    WHERE relation.subject_id = `)
    .append(rssFeedItemId)
    .append(sql`
      AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
  ) AND NOT EXISTS (
    SELECT 1 FROM relation__rss_feed_item__category__topic_alias relation
    JOIN topic_aliases alias ON alias.id = relation.object_id
    JOIN excluded_topics excluded ON excluded.topic_id = alias.topic_id
    WHERE relation.subject_id = `)
    .append(rssFeedItemId).append(sql`
      AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
  )`)
}
