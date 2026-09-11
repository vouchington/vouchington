import sql, { type SQLStatement } from 'sql-template-strings'
import { buildRssFeedItemTopicMembershipExists } from '@modules/feed-query-builders'

export function appendRssFeedItemHashtagFilters(
  query: SQLStatement,
  {
    aliasIds,
    hasUnknownHashtag,
    rssFeedItemId = sql`rss_feed_items.id`,
    topicIds,
  }: {
    aliasIds: string[] | undefined
    hasUnknownHashtag: boolean | undefined
    rssFeedItemId?: SQLStatement
    topicIds: string[] | undefined
  },
): void {
  if (hasUnknownHashtag) query.append(sql` AND FALSE`)
  for (const topicId of [...new Set(topicIds ?? [])]) {
    query
      .append(sql`
      AND (
        EXISTS (
          SELECT 1
          FROM rss_feed_item_sources hashtag_sources
          JOIN rss_feeds hashtag_feeds ON hashtag_feeds.id = hashtag_sources.rss_feed_id
          WHERE hashtag_sources.rss_feed_item_id = `)
      .append(rssFeedItemId)
      .append(sql`
            AND hashtag_feeds.topic_id = ${topicId}
            AND hashtag_feeds.is_enabled = TRUE
            AND hashtag_feeds.deleted_at IS NULL
        )
        OR `)
      .append(buildRssFeedItemTopicMembershipExists(rssFeedItemId.text, topicId)).append(sql`
      )
    `)
  }
  for (const aliasId of [...new Set(aliasIds ?? [])]) {
    query
      .append(sql`
      AND EXISTS (
        SELECT 1 FROM relation__rss_feed_item__category__topic_alias relation
        WHERE relation.subject_id = `)
      .append(rssFeedItemId).append(sql` AND relation.object_id = ${aliasId}
          AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
      )
    `)
  }
}
