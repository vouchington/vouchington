import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import type { TopicMetrics } from './types.mts'
import { getTopicMetricsByAnyBatch } from './metrics-batch.mts'
import { buildViewerPostDiscoveryEligibilityFilter } from '@modules/feed-query-builders'
import { buildTopicViewerDiscussionCount } from './metrics-viewer-discussions.mts'
import {
  getProfileCountCap,
  profileCountProbeLimit,
  toCappedCount,
} from '@services/users/profile-count-cap'

export async function getTopicMetricsByAny(
  idOrSlug: string,
  options: QueryOptions = {},
): Promise<TopicMetrics | null> {
  const [metrics] = await getTopicMetricsByAnyBatch([idOrSlug], options)
  return metrics
}

export async function getTopicViewerCounts(
  currentUser: PrivateUser,
  topicId: string,
  options: QueryOptions = {},
): Promise<
  NonNullable<TopicMetrics['viewer_count']> & {
    count_capped: NonNullable<TopicMetrics['viewer_count_capped']>
  }
> {
  const cap = getProfileCountCap()
  const probeLimit = profileCountProbeLimit(cap)
  const eligibility = buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
    currentUserId: currentUser.id,
    isAdministrator: currentUser.roles.includes('administrator'),
  })
  const query = sql`/* getTopicViewerCounts */
      SELECT
        (
        `
  query.append(buildTopicViewerDiscussionCount(topicId, probeLimit, eligibility)).append(sql`
        ) AS count__discussions,
        (
          SELECT COUNT(*)::bigint FROM (
          SELECT candidate_post.id
          FROM posts candidate_post
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
          JOIN post_review_topic_ratings prtr
            ON prtr.post_id = candidate_post.id
           AND prtr.topic_id = ${topicId}
          WHERE candidate_post.post_type = 'review'
            AND `)
  query.append(eligibility).append(sql`
          LIMIT ${probeLimit}
          ) counted_posts
        ) AS count__reviews,
        (
          SELECT COUNT(*)::bigint FROM (
          SELECT candidate_post.id
          FROM posts candidate_post
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
          JOIN post_data_point_topics pdpt
            ON pdpt.post_id = candidate_post.id
           AND pdpt.topic_id = ${topicId}
          WHERE candidate_post.post_type = 'data_point'
            AND `)
  query.append(eligibility).append(sql`
          LIMIT ${probeLimit}
          ) counted_posts
        ) AS count__data_points
    `)
  const { rows } = await read(query, options)

  const row = rows[0] ?? {}

  const discussions = toCappedCount(row.count__discussions as string, cap)
  const reviews = toCappedCount(row.count__reviews as string, cap)
  const dataPoints = toCappedCount(row.count__data_points as string, cap)
  return {
    discussions: discussions.count,
    reviews: reviews.count,
    'data-points': dataPoints.count,
    count_capped: {
      discussions: discussions.capped,
      reviews: reviews.capped,
      'data-points': dataPoints.capped,
    },
  }
}
