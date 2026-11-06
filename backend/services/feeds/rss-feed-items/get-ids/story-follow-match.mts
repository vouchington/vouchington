import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'

type MatchOptions = {
  communityId?: string
  currentUserId?: string
  feedType: RssFeedItemFeedType | undefined
  eligibilityChildLimit: number
  minScoreFollowRssFeeds: number
  minScoreFollowTopics: number
  /** Unknown is safe only when vetoing an older story member. */
  allowUnknown?: boolean
}

/** The newer-story check cannot use cursor-selected source flags. */
export function buildStableStoryMatch(
  itemId: SQLStatement,
  score: SQLStatement,
  options: MatchOptions,
) {
  const source = sql`(`
    .append(score)
    .append(sql` >= ${options.minScoreFollowRssFeeds}
    AND EXISTS (
      SELECT 1 FROM (
        SELECT rss_feed_id FROM rss_feed_item_sources
        WHERE rss_feed_item_id = `)
    .append(itemId)
    .append(sql`
        ORDER BY rss_feed_id DESC LIMIT ${options.eligibilityChildLimit}
      ) association
      JOIN rss_feeds live_feed ON live_feed.id = association.rss_feed_id
        AND live_feed.is_enabled = TRUE AND live_feed.deleted_at IS NULL
      WHERE `)
    .append(buildFollowedPair('feed', sql`association.rss_feed_id`, options)).append(sql`
    ))`)
  const topic = sql`(`.append(score).append(sql` >= ${options.minScoreFollowTopics}
    AND (`)
  if (options.allowUnknown)
    topic
      .append(sql`(SELECT COUNT(*) FROM (
        SELECT 1 FROM rss_feed_item_topic_candidates
        WHERE rss_feed_item_id = `)
      .append(itemId).append(sql`
        ORDER BY topic_id DESC LIMIT ${options.eligibilityChildLimit + 1}
      ) bounded_topics) > ${options.eligibilityChildLimit} OR `)
  topic
    .append(sql`EXISTS (
        SELECT 1 FROM (
          SELECT topic_id FROM rss_feed_item_topic_candidates
          WHERE rss_feed_item_id = `)
    .append(itemId)
    .append(sql`
          ORDER BY topic_id DESC LIMIT ${options.eligibilityChildLimit}
        ) association
        WHERE `)
    .append(buildFollowedPair('topic', sql`association.topic_id`, options)).append(sql`
      )
    ))`)
  if (options.feedType === 'follow_rss_feeds') return source
  if (options.feedType === 'follow_topics') return topic
  if (options.feedType === 'all')
    return sql`(`
      .append(source)
      .append(sql` AND `)
      .append(topic)
      .append(sql`)`)
  return sql`(`
    .append(source)
    .append(sql` OR `)
    .append(topic)
    .append(sql`)`)
}

function buildFollowedPair(kind: 'feed' | 'topic', childId: SQLStatement, options: MatchOptions) {
  const { communityId, currentUserId, eligibilityChildLimit } = options
  const listTable = kind === 'feed' ? sql`community_list_rss_feeds` : sql`community_list_topics`
  const childColumn = kind === 'feed' ? sql`rss_feed_id` : sql`topic_id`
  if (communityId)
    return sql`EXISTS (SELECT 1 FROM `
      .append(listTable)
      .append(sql` listing
      JOIN communities community ON community.id = listing.community_id
        AND community.deleted_at IS NULL
      WHERE listing.community_id = ${communityId} AND listing.`)
      .append(childColumn)
      .append(sql` = `)
      .append(childId)
      .append(sql` AND listing.removed_at IS NULL)`)
  if (!currentUserId) return sql`FALSE`
  const directTable =
    kind === 'feed' ? sql`relation__user__follow__rss_feed` : sql`relation__user__follow__topic`
  const direct = sql`EXISTS (SELECT 1 FROM `
    .append(directTable)
    .append(sql` direct_follow WHERE direct_follow.subject_id = ${currentUserId}
      AND direct_follow.object_id = `)
    .append(childId)
    .append(sql` AND direct_follow.deleted_at IS NULL)`)
  const proxyPage = sql`SELECT listing.community_id FROM `
    .append(listTable)
    .append(sql` listing WHERE listing.`)
    .append(childColumn)
    .append(sql` = `)
    .append(childId).append(sql` AND listing.removed_at IS NULL
      ORDER BY listing.community_id DESC LIMIT ${eligibilityChildLimit + 1}`)
  const proxy = sql`EXISTS (
    SELECT 1 FROM (`.append(proxyPage).append(sql`) listed
    JOIN relation__user__proxy_follow__community proxy_follow
      ON proxy_follow.subject_id = ${currentUserId}
      AND proxy_follow.object_id = listed.community_id
      AND proxy_follow.deleted_at IS NULL
    JOIN communities community ON community.id = listed.community_id
      AND community.deleted_at IS NULL
    WHERE community.visibility = 'public' OR EXISTS (
      SELECT 1 FROM community_members member
      WHERE member.community_id = community.id AND member.user_id = ${currentUserId}
        AND member.removed_at IS NULL
    )
  )`)
  const match = sql`(`
    .append(direct)
    .append(sql` OR `)
    .append(proxy)
  if (options.allowUnknown)
    match
      .append(sql` OR (SELECT COUNT(*) FROM (`)
      .append(proxyPage)
      .append(sql`) listed) > ${eligibilityChildLimit}`)
  return match.append(sql`)`)
}
