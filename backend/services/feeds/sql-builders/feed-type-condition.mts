import sql, { type SQLStatement } from 'sql-template-strings'
import type { FeedTypeConfig } from './types.mts'
import { buildFollowedTopicsCondition } from './followed-topics-condition.mts'

export function buildFeedTypeCondition(
  feedType: 'follow_users' | 'follow_rss_feeds' | 'follow_topics' | 'any' | 'all',
  config: FeedTypeConfig,
): SQLStatement {
  if (
    (feedType === 'follow_users' || feedType === 'follow_rss_feeds') &&
    config.sourceMatchColumn
  ) {
    return sql`/* buildFeedTypeCondition:fragment */
      AND `.append(config.sourceMatchColumn)
  }

  if (feedType === 'follow_topics' && config.topicsMatchColumn) {
    return sql`/* buildFeedTypeCondition:fragment */
      AND `.append(config.topicsMatchColumn)
  }

  if (feedType === 'any' && config.sourceMatchColumn && config.topicsMatchColumn) {
    return sql`/* buildFeedTypeCondition:fragment */
      AND (`
      .append(config.sourceMatchColumn)
      .append(sql` OR `)
      .append(config.topicsMatchColumn)
      .append(sql`)`)
  }

  if (feedType === 'all' && config.sourceMatchColumn && config.topicsMatchColumn) {
    return sql`/* buildFeedTypeCondition:fragment */
      AND `
      .append(config.sourceMatchColumn)
      .append(sql` AND `)
      .append(config.topicsMatchColumn)
  }

  const sourceFilter = sql`EXISTS (
        SELECT 1 FROM `
    .append(config.followedCTEAlias)
    .append(sql` WHERE `)
    .append(config.followedCTEAlias)
    .append(sql`.`)
    .append(config.followedCTEColumn)
    .append(sql` = `)
    .append(config.sourceIdColumn ?? 'NULL').append(sql`
      )`)

  const topicsFilter = buildFollowedTopicsCondition(config.topicsConditions)

  if (feedType === 'follow_users' || feedType === 'follow_rss_feeds') {
    const result = sql`/* buildFeedTypeCondition:fragment */
      AND `
    result.append(config.scoreColumn)
    result.append(sql` >= ${config.minScoreSource}
      AND `)
    result.append(sourceFilter)
    return result
  }

  if (feedType === 'follow_topics') {
    const result = sql`/* buildFeedTypeCondition:fragment */
      AND `
    result.append(config.scoreColumn)
    result.append(sql` >= ${config.minScoreTopics}
      AND (
        `)
    result.append(topicsFilter)
    result.append(sql`
      )`)
    return result
  }

  if (feedType === 'any') {
    const result = sql`/* buildFeedTypeCondition:fragment */
      AND (
        (`
    result.append(config.scoreColumn)
    result.append(sql` >= ${config.minScoreSource} AND `)
    result.append(sourceFilter)
    result.append(sql`)
        OR
        (`)
    result.append(config.scoreColumn)
    result.append(sql` >= ${config.minScoreTopics} AND (
          `)
    result.append(topicsFilter)
    result.append(sql`
        ))
      )`)
    return result
  }

  if (feedType === 'all') {
    const minScoreAll = Math.max(config.minScoreSource, config.minScoreTopics)
    const result = sql`/* buildFeedTypeCondition:fragment */
      AND `
    result.append(config.scoreColumn)
    result.append(sql` >= ${minScoreAll}
      AND `)
    result.append(sourceFilter)
    result.append(sql`
      AND (
        `)
    result.append(topicsFilter)
    result.append(sql`
      )`)
    return result
  }

  return sql`/* buildFeedTypeCondition:fragment */`
}
