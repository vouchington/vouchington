import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'

export function appendMatchedItemCTEs(
  query: SQLStatement,
  {
    feedType,
    itemCutoffId,
  }: { feedType: RssFeedItemFeedType | undefined; itemCutoffId: string | null },
): void {
  query.append(sql`, matched_source_rss_feed_item_ids AS MATERIALIZED (
    SELECT DISTINCT source.rss_feed_item_id AS item_id
    FROM followed_rss_feeds
    JOIN rss_feed_item_sources source ON source.rss_feed_id = followed_rss_feeds.rss_feed_id
    WHERE `)
  query.append(feedType === 'follow_topics' ? 'false' : 'true')
  appendItemCutoff(query, sql`source.rss_feed_item_id`, itemCutoffId)
  query
    .append(sql`
  ), matched_topic_rss_feed_item_ids AS MATERIALIZED (
    SELECT category.rss_feed_item_id AS item_id
    FROM followed_topics
    JOIN rss_feed_item_categories category ON category.topic_id = followed_topics.topic_id
    WHERE `)
    .append(feedType === 'follow_rss_feeds' ? 'false' : 'true')
  appendItemCutoff(query, sql`category.rss_feed_item_id`, itemCutoffId)
  query
    .append(sql`
    UNION
    SELECT relation.subject_id AS item_id
    FROM followed_topics
    JOIN relation__rss_feed_item__category__topic relation ON relation.object_id = followed_topics.topic_id
    WHERE relation.deleted_at IS NULL AND relation.votes_score_net > 0
      AND `)
    .append(feedType === 'follow_rss_feeds' ? 'false' : 'true')
  appendItemCutoff(query, sql`relation.subject_id`, itemCutoffId)
  query
    .append(sql`
    UNION
    SELECT relation.subject_id AS item_id
    FROM followed_topics
    JOIN topic_aliases alias ON alias.topic_id = followed_topics.topic_id
    JOIN relation__rss_feed_item__category__topic_alias relation ON relation.object_id = alias.id
    WHERE relation.deleted_at IS NULL AND relation.votes_score_net > 0
      AND `)
    .append(feedType === 'follow_rss_feeds' ? 'false' : 'true')
  appendItemCutoff(query, sql`relation.subject_id`, itemCutoffId)
  query.append(sql`
  ), matched_direct_rss_feed_item_ids AS MATERIALIZED (
    SELECT item_id, bool_or(matches_source) AS matches_source, bool_or(matches_topics) AS matches_topics
    FROM (
      SELECT item_id, true AS matches_source, false AS matches_topics FROM matched_source_rss_feed_item_ids
      UNION ALL
      SELECT item_id, false AS matches_source, true AS matches_topics FROM matched_topic_rss_feed_item_ids
    ) matches
    GROUP BY item_id
  )`)
}

function appendItemCutoff(
  query: SQLStatement,
  itemId: SQLStatement,
  cutoffId: string | null,
): void {
  if (cutoffId)
    query
      .append(sql` AND `)
      .append(itemId)
      .append(sql` >= ${cutoffId}::uuid`)
}
