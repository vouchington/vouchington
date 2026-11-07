import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'
import { buildItemTopicPredicateMatch } from './item-membership.mts'
import { buildActiveFollowedRssFeed, buildActiveFollowedTopic } from './viewer-membership.mts'

export function buildFollowedSourceMatch(itemId: SQLStatement): SQLStatement {
  const query = sql`COALESCE((SELECT BOOL_OR(`
  query.append(buildActiveFollowedRssFeed(sql`source.rss_feed_id`))
  query.append(sql`) FROM rss_feed_item_sources source WHERE source.rss_feed_item_id = `)
  query.append(itemId).append(sql`), FALSE)`)
  return query
}

export function buildFollowedTopicMatch(itemId: SQLStatement): SQLStatement {
  return buildItemTopicPredicateMatch(itemId, buildActiveFollowedTopic, true)
}

/** `all` is the owner's source-or-topic union for this personalized RSS feed. */
export function appendFollowMembershipFilter(
  query: SQLStatement,
  itemId: SQLStatement,
  score: SQLStatement,
  feedType: RssFeedItemFeedType,
  minScoreFollowRssFeeds: number,
  minScoreFollowTopics: number,
): void {
  const source = sql`(`
    .append(score)
    .append(sql` >= ${minScoreFollowRssFeeds} AND `)
    .append(buildFollowedSourceMatch(itemId))
    .append(sql`)`)
  const topic = sql`(`
    .append(score)
    .append(sql` >= ${minScoreFollowTopics} AND `)
    .append(buildFollowedTopicMatch(itemId))
    .append(sql`)`)
  query.append(sql` AND (`)
  if (feedType === 'follow_rss_feeds') query.append(source)
  else if (feedType === 'follow_topics') query.append(topic)
  else
    query
      .append(source)
      .append(sql` OR `)
      .append(topic)
  query.append(sql`)`)
}
