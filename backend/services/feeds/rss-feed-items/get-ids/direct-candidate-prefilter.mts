import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'
import { buildFollowedTopicCategoryCondition } from './followed-topic-category-condition.mts'

export function appendPreFilterCondition(
  query: SQLStatement,
  feedType: RssFeedItemFeedType | undefined,
  minScoreFollowRssFeeds: number,
  minScoreFollowTopics: number,
  rssFeedItemId: SQLStatement = sql`rss_feed_items.id`,
  rssFeedItemVotes: SQLStatement = sql`rss_feed_items.votes_score_net`,
): void {
  if (feedType === 'follow_rss_feeds') {
    query.append(sql`
        AND `)
    query.append(rssFeedItemVotes).append(sql` >= ${minScoreFollowRssFeeds}
        AND EXISTS (
          SELECT 1 FROM rss_feed_item_sources rfis_pre
          JOIN followed_rss_feeds ON followed_rss_feeds.rss_feed_id = rfis_pre.rss_feed_id
          WHERE rfis_pre.rss_feed_item_id = `)
    query.append(rssFeedItemId).append(sql`
        )`)
  } else if (feedType === 'follow_topics') {
    query.append(sql`
        AND `)
    query.append(rssFeedItemVotes).append(sql` >= ${minScoreFollowTopics}
        AND `)
    appendFollowedTopicCategoryCondition(query, rssFeedItemId)
  } else if (feedType === 'all') {
    query.append(sql`
        AND `)
    query.append(rssFeedItemVotes).append(sql` >= ${minScoreFollowRssFeeds}
        AND EXISTS (
          SELECT 1 FROM rss_feed_item_sources rfis_pre
          JOIN followed_rss_feeds ON followed_rss_feeds.rss_feed_id = rfis_pre.rss_feed_id
          WHERE rfis_pre.rss_feed_item_id = `)
    query.append(rssFeedItemId).append(sql`
        )
        AND `)
    query.append(rssFeedItemVotes).append(sql` >= ${minScoreFollowTopics}
        AND `)
    appendFollowedTopicCategoryCondition(query, rssFeedItemId)
  } else {
    query.append(sql`
        AND (
          (
            `)
    query.append(rssFeedItemVotes).append(sql` >= ${minScoreFollowRssFeeds}
            AND EXISTS (
              SELECT 1 FROM rss_feed_item_sources rfis_pre
              JOIN followed_rss_feeds ON followed_rss_feeds.rss_feed_id = rfis_pre.rss_feed_id
            WHERE rfis_pre.rss_feed_item_id = `)
    query.append(rssFeedItemId).append(sql`
          )
          )
          OR (
            `)
    query.append(rssFeedItemVotes).append(sql` >= ${minScoreFollowTopics}
            AND `)
    appendFollowedTopicCategoryCondition(query, rssFeedItemId)
    query.append(sql`
          )
        )`)
  }
}

function appendFollowedTopicCategoryCondition(
  query: SQLStatement,
  rssFeedItemId: SQLStatement,
): void {
  query.append(buildFollowedTopicCategoryCondition(rssFeedItemId))
}
