import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'

export function buildFollowedSourceMatch(itemId: SQLStatement): SQLStatement {
  // Make the viewer's active followed ids one uncorrelated input so generic plans cannot
  // multiply every source row by the followed-feed set for each candidate item.
  return sql`COALESCE((
    SELECT BOOL_OR(source.rss_feed_id = ANY(ARRAY(
      SELECT followed.rss_feed_id FROM followed_rss_feeds followed
      JOIN rss_feeds feed ON feed.id = followed.rss_feed_id
        AND feed.is_enabled = TRUE AND feed.deleted_at IS NULL
    )))
    FROM rss_feed_item_sources source
    WHERE source.rss_feed_item_id = `.append(itemId).append(sql`
  ), FALSE)`)
}

export function buildFollowedTopicMatch(itemId: SQLStatement): SQLStatement {
  return sql`(
    EXISTS (SELECT 1 FROM rss_feed_item_categories category
      JOIN followed_topics followed ON followed.topic_id = category.topic_id
      WHERE category.rss_feed_item_id = `
    .append(itemId)
    .append(sql`)
    OR EXISTS (SELECT 1 FROM relation__rss_feed_item__category__topic relation
      JOIN followed_topics followed ON followed.topic_id = relation.object_id
      WHERE relation.subject_id = `)
    .append(itemId)
    .append(sql`
        AND relation.deleted_at IS NULL AND relation.votes_score_net > 0)
    OR EXISTS (SELECT 1 FROM relation__rss_feed_item__category__topic_alias relation
      JOIN topic_aliases alias ON alias.id = relation.object_id
      JOIN followed_topics followed ON followed.topic_id = alias.topic_id
      WHERE relation.subject_id = `)
    .append(itemId).append(sql`
        AND relation.deleted_at IS NULL AND relation.votes_score_net > 0)
  )`)
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
