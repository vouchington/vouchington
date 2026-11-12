import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { NIL, MAX } from 'uuid'
import type { PrivateUser } from '@services/users/types'
import type { TopicMetrics } from './types.mts'
import { getTopicMetricsByAnyBatch } from './metrics-batch.mts'
import { buildViewerPostDiscoveryEligibilityFilter } from '@modules/feed-query-builders'
import {
  buildTopicViewerDiscussionCount,
  buildTopicViewerDiscussionInputs,
} from './metrics-viewer-discussions.mts'
import { getTopicsWorkLimit } from './work-limits.mts'
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
  const inputCap = getTopicsWorkLimit('viewer_count_input_cap')
  const eligibility = buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
    currentUserId: currentUser.id,
    isAdministrator: currentUser.roles.includes('administrator'),
  })
  const query = sql`/* getTopicViewerCounts */ WITH `.append(
    buildTopicViewerDiscussionInputs(topicId, inputCap),
  ).append(sql`, viewer_review_inputs AS MATERIALIZED (
      SELECT post_id FROM post_review_topic_ratings
      WHERE (topic_id, post_id) >= (${topicId}::uuid, ${NIL}::uuid)
        AND (topic_id, post_id) <= (${topicId}::uuid, ${MAX}::uuid)
      ORDER BY topic_id, post_id LIMIT ${inputCap}
    ), viewer_data_point_inputs AS MATERIALIZED (
      SELECT post_id FROM post_data_point_topics
      WHERE (topic_id, post_id) >= (${topicId}::uuid, ${NIL}::uuid)
        AND (topic_id, post_id) <= (${topicId}::uuid, ${MAX}::uuid)
      ORDER BY topic_id, post_id LIMIT ${inputCap}
    )
      SELECT
        (SELECT COUNT(*) >= ${inputCap} FROM viewer_alias_inputs)
          OR (SELECT COUNT(*) >= ${inputCap} FROM viewer_direct_inputs)
          OR (SELECT COUNT(*) >= ${inputCap} FROM viewer_alias_relation_inputs)
          AS discussions_input_capped,
        (SELECT COUNT(*) >= ${inputCap} FROM viewer_review_inputs) AS reviews_input_capped,
        (SELECT COUNT(*) >= ${inputCap} FROM viewer_data_point_inputs)
          AS data_points_input_capped,
        (
        `)
  query.append(buildTopicViewerDiscussionCount(probeLimit, eligibility)).append(sql`
        ) AS count__discussions,
        (
          SELECT COUNT(*)::bigint FROM (
          SELECT candidate_post.id
          FROM posts candidate_post
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
          JOIN viewer_review_inputs input ON input.post_id = candidate_post.id
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
          JOIN viewer_data_point_inputs input ON input.post_id = candidate_post.id
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
      discussions: discussions.capped || row.discussions_input_capped === true,
      reviews: reviews.capped || row.reviews_input_capped === true,
      'data-points': dataPoints.capped || row.data_points_input_capped === true,
    },
  }
}
