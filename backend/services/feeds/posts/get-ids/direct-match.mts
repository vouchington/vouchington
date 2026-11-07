import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostFeedOptions } from '../../types.mts'
import { buildDirectTopicsFilter } from './topic-match-filter.mts'

/**
 * The feed-type condition for a direct delivery, written as plain predicates over the
 * `eligible_posts` row so the planner can evaluate it inside the page walk.
 */
export function buildDirectMatchCondition({
  feedType,
  minScoreFollowTopics,
  minScoreFollowUsers,
}: {
  feedType: PostFeedOptions['feed_type']
  minScoreFollowTopics: number
  minScoreFollowUsers: number
}): SQLStatement {
  const source = sql`(
    eligible_posts.votes_score_net >= ${minScoreFollowUsers}
    AND EXISTS (
      SELECT 1 FROM followed_users
      WHERE followed_users.user_id = eligible_posts.created_by_id
    )
  )`
  const topics = sql`(
    eligible_posts.votes_score_net >= ${minScoreFollowTopics}
    AND (`.append(buildDirectTopicsFilter()).append(sql`)
  )`)
  if (feedType === 'follow_users') return source
  if (feedType === 'follow_topics') return topics
  return sql`(`
    .append(source)
    .append(feedType === 'all' ? sql` AND ` : sql` OR `)
    .append(topics)
    .append(sql`)`)
}
