import sql, { type SQLStatement } from 'sql-template-strings'
import { appendRssFeedItemTopicMuteFilters } from './topic-mute-filters.mts'

export function buildRssFeedItemSourceMuteFilter(): SQLStatement {
  return sql`          AND NOT EXISTS (
            SELECT 1 FROM excluded_rss_feeds
            WHERE excluded_rss_feeds.rss_feed_id = rfis.rss_feed_id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM excluded_topics
            WHERE excluded_topics.topic_id = (
              SELECT publisher_type_relation.object_id
              FROM relation__topic__publisher_type__topic publisher_type_relation
              JOIN topics publisher_type ON publisher_type.id = publisher_type_relation.object_id
              WHERE publisher_type_relation.subject_id = rf.topic_id
                AND publisher_type_relation.deleted_at IS NULL
                AND publisher_type_relation.votes_score_net > 0
                AND publisher_type.deleted_at IS NULL
              ORDER BY publisher_type_relation.votes_score_net DESC NULLS LAST,
                publisher_type_relation.id ASC
              LIMIT 1
            )
          )
`
}

export function appendRssFeedItemViewerEligibilityFilters(
  query: SQLStatement,
  rssFeedItemId: SQLStatement,
  rssFeedItemUrlId: SQLStatement,
): void {
  query.append(sql`
      AND NOT EXISTS (
        SELECT 1 FROM hidden_items WHERE hidden_items.rss_feed_item_id = `)
  query.append(rssFeedItemId).append(sql`
      )
  `)
  appendRssFeedItemTopicMuteFilters(query, rssFeedItemId)
  query.append(sql`
      AND NOT EXISTS (
        SELECT 1 FROM urls u_excl
        WHERE u_excl.id = `)
  query.append(rssFeedItemUrlId).append(sql`
          AND u_excl.hostname_id IN (SELECT hostname_id FROM excluded_hostname_ids)
      )
  `)
}
