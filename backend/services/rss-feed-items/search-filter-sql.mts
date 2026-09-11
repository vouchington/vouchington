import { buildRssFeedItemTopicMembershipExists } from '@modules/feed-query-builders'
import { feedIsEnabledAndDiscoverableSql } from '@modules/feed-query-builders/discoverability-sql'
import sql, { type SQLStatement } from 'sql-template-strings'

export function buildFeedOwnerTopicFilter(ids: string[]): SQLStatement {
  const filter = sql`EXISTS (
      SELECT 1 FROM rss_feed_item_sources rfis
      JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
      WHERE rfis.rss_feed_item_id = rss_feed_items.id
        AND rf.topic_id = ANY(${ids})
        AND rf.deleted_at IS NULL
        AND `
  filter.append(feedIsEnabledAndDiscoverableSql('rf'))
  filter.append(sql`
    )`)
  return filter
}

export function buildCategoryTopicFilter(ids: string[]): SQLStatement {
  return sql`EXISTS (
      SELECT 1
      FROM rss_feed_item_categories rfic
      WHERE rfic.rss_feed_item_id = rss_feed_items.id
        AND rfic.topic_id IS NOT NULL
        AND rfic.topic_id = ANY(${ids})
    )`
}

/**
 * Uses a candidate-bind `IN (…)` shape via `buildRssFeedItemTopicMembershipExists` rather than a
 * correlated `EXISTS (… UNION ALL …)`: Postgres cannot pull a `UNION ALL` body into a semijoin, so
 * the old shape materialized the full candidate set once per outer row instead of once per query.
 * See the doc comment on `buildTopicMembershipExists` in `topic-post-candidates.mts` for the
 * anti-pattern this avoids (`no-mistakes`' `postgres-sql-shape-policy`, #11082).
 */
export function buildHashtagTopicFilter(topicId: string): SQLStatement {
  return buildRssFeedItemTopicMembershipExists('rss_feed_items.id', topicId)
}
