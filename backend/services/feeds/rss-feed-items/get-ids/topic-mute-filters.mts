import sql, { type SQLStatement } from 'sql-template-strings'

export function appendRssFeedItemTopicMuteFilters(
  query: SQLStatement,
  rssFeedItemId: SQLStatement,
  eligibilityChildLimit: number,
): void {
  query
    .append(sql`
    AND (
      SELECT COUNT(*) FROM (
        SELECT 1 FROM rss_feed_item_topic_candidates
        WHERE rss_feed_item_id = `)
    .append(rssFeedItemId)
    .append(sql`
        ORDER BY topic_id DESC LIMIT ${eligibilityChildLimit + 1}
      ) bounded_topics
    ) <= ${eligibilityChildLimit}
    AND NOT EXISTS (
      SELECT 1
      FROM (
        SELECT topic_id FROM rss_feed_item_topic_candidates
        WHERE rss_feed_item_id = `)
    .append(rssFeedItemId).append(sql`
        ORDER BY topic_id DESC LIMIT ${eligibilityChildLimit}
      ) item_topics
      JOIN excluded_topics ON excluded_topics.topic_id = item_topics.topic_id
    )
  `)
}
