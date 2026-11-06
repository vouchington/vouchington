import sql, { type SQLStatement } from 'sql-template-strings'
import { appendRssFeedItemTopicMuteFilters } from './topic-mute-filters.mts'

export function buildRssFeedItemSourceMuteFilter(): SQLStatement {
  const query = sql`          AND NOT EXISTS (
            SELECT 1 FROM excluded_rss_feeds
            WHERE excluded_rss_feeds.rss_feed_id = rfis.rss_feed_id
          )`
  query.append(sql`
          AND NOT EXISTS (
            SELECT 1
            FROM excluded_topics
            WHERE excluded_topics.topic_id = (
              SELECT publisher_type_relation.object_id
              FROM `)
  query.append(sql`relation__topic__publisher_type__topic publisher_type_relation`)
  query.append(sql`
              JOIN topics publisher_type ON publisher_type.id = publisher_type_relation.object_id
              WHERE publisher_type_relation.subject_id = rf.topic_id
                AND publisher_type_relation.deleted_at IS NULL
                AND publisher_type_relation.votes_score_net > 0
                AND publisher_type.deleted_at IS NULL
              ORDER BY publisher_type_relation.votes_score_sort DESC,
                publisher_type_relation.created_at DESC, publisher_type_relation.object_id DESC
              LIMIT 1
            )
          )
`)
  return query
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
        SELECT 1 FROM urls target_url
        JOIN url_hostnames target_hostname ON target_hostname.id = target_url.hostname_id
        WHERE target_url.id = `)
  query.append(rssFeedItemUrlId).append(sql`
          AND (
            target_hostname.is_blocked
            OR EXISTS (
              SELECT 1 FROM excluded_hostnames excluded
              WHERE target_hostname.reversed_hostname = excluded.reversed_hostname
                OR target_hostname.reversed_hostname LIKE excluded.reversed_hostname || '.%'
            )
          )
      )
    `)
}
