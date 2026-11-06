import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildCommunityListProxyFollowedTopicsCTE,
  buildCommunityListTopicsCTE,
} from '../../sql-builders/index.mts'
import { appendPersonalizedExclusionCTEs } from './personalized-exclusions.mts'

/** Viewer-side relation sets are independent of the delivery cursor. */
export function appendRelationCTEs(
  query: SQLStatement,
  { communityId, currentUserId }: { communityId?: string; currentUserId?: string },
): SQLStatement {
  query.append(sql`followed_rss_feeds AS NOT MATERIALIZED (`)
  if (communityId)
    query.append(sql`SELECT listing.rss_feed_id FROM community_list_rss_feeds listing
      JOIN communities community ON community.id = listing.community_id
        AND community.deleted_at IS NULL
      WHERE listing.community_id = ${communityId} AND listing.removed_at IS NULL`)
  else if (currentUserId)
    query.append(sql`SELECT object_id AS rss_feed_id FROM relation__user__follow__rss_feed
      WHERE subject_id = ${currentUserId} AND deleted_at IS NULL
      UNION
      SELECT listing.rss_feed_id FROM relation__user__proxy_follow__community proxy
      JOIN communities community ON community.id = proxy.object_id
        AND community.deleted_at IS NULL
      JOIN community_list_rss_feeds listing ON listing.community_id = proxy.object_id
        AND listing.removed_at IS NULL
      WHERE proxy.subject_id = ${currentUserId} AND proxy.deleted_at IS NULL
        AND (community.visibility = 'public' OR EXISTS (
          SELECT 1 FROM community_members member
          WHERE member.community_id = community.id AND member.user_id = ${currentUserId}
            AND member.removed_at IS NULL))`)
  else query.append(sql`SELECT NULL::uuid AS rss_feed_id WHERE FALSE`)
  query.append(sql`), followed_topics AS NOT MATERIALIZED (
    SELECT candidate.topic_id FROM (`)
  if (communityId) query.append(buildCommunityListTopicsCTE(communityId))
  else if (currentUserId)
    query
      .append(sql`SELECT object_id AS topic_id FROM relation__user__follow__topic
      WHERE subject_id = ${currentUserId} AND deleted_at IS NULL
      UNION `)
      .append(buildCommunityListProxyFollowedTopicsCTE(currentUserId))
  else query.append(sql`SELECT NULL::uuid AS topic_id WHERE FALSE`)
  query.append(sql`) candidate
    JOIN topics active_topic ON active_topic.id = candidate.topic_id
      AND active_topic.deleted_at IS NULL AND active_topic.merged_into_topic_id IS NULL
  ), `)
  appendPersonalizedExclusionCTEs(query, currentUserId)
  return query
}
