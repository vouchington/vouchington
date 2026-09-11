import sql, { type SQLStatement } from 'sql-template-strings'

/** Matches a positive direct or alias category relation to a followed topic. */
export function buildFollowedTopicCategoryCondition(rssFeedItemId: SQLStatement): SQLStatement {
  return sql`(
    EXISTS (
      SELECT 1 FROM rss_feed_item_categories rfc_match
      JOIN followed_topics ON followed_topics.topic_id = rfc_match.topic_id
      WHERE rfc_match.rss_feed_item_id = `
    .append(rssFeedItemId)
    .append(sql`
    )
    OR EXISTS (
      SELECT 1 FROM relation__rss_feed_item__category__topic rct_match
      JOIN followed_topics ON followed_topics.topic_id = rct_match.object_id
      WHERE rct_match.subject_id = `)
    .append(rssFeedItemId)
    .append(sql`
        AND rct_match.deleted_at IS NULL
        AND rct_match.votes_score_net > 0
    )
    OR EXISTS (
      SELECT 1 FROM relation__rss_feed_item__category__topic_alias rcta_match
      JOIN topic_aliases alias_match ON alias_match.id = rcta_match.object_id
      JOIN followed_topics ON followed_topics.topic_id = alias_match.topic_id
      WHERE rcta_match.subject_id = `)
    .append(rssFeedItemId).append(sql`
        AND rcta_match.deleted_at IS NULL
        AND rcta_match.votes_score_net > 0
    )
  )`)
}
