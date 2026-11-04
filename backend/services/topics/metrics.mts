import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import type { TopicMetrics } from './types.mts'
import { getTopicMetricsByAnyBatch } from './metrics-batch.mts'
import {
  buildViewerPostDiscoveryEligibilityFilter,
  buildTopicPostCandidateSelect,
} from '@modules/feed-query-builders'

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
): Promise<NonNullable<TopicMetrics['viewer_count']>> {
  const eligibility = buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
    currentUserId: currentUser.id,
    isAdministrator: currentUser.roles.includes('administrator'),
  })
  const query = sql`/* getTopicViewerCounts */
      SELECT
        (
          SELECT COUNT(DISTINCT candidate_post.id)::bigint
          FROM (`.append(buildTopicPostCandidateSelect(topicId)).append(sql`) candidate
          JOIN posts candidate_post ON candidate_post.id = candidate.post_id
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
          WHERE candidate_post.post_type = 'discussion'
            AND `)
  query.append(eligibility).append(sql`
        ) AS count__discussions,
        (
          SELECT COUNT(DISTINCT candidate_post.id)::bigint
          FROM posts candidate_post
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
          JOIN post_review_topic_ratings prtr
            ON prtr.post_id = candidate_post.id
           AND prtr.topic_id = ${topicId}
          WHERE candidate_post.post_type = 'review'
            AND `)
  query.append(eligibility).append(sql`
        ) AS count__reviews,
        (
          SELECT COUNT(DISTINCT candidate_post.id)::bigint
          FROM posts candidate_post
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
          JOIN post_data_point_topics pdpt
            ON pdpt.post_id = candidate_post.id
           AND pdpt.topic_id = ${topicId}
          WHERE candidate_post.post_type = 'data_point'
            AND `)
  query.append(eligibility).append(sql`
        ) AS count__data_points
    `)
  const { rows } = await read(query, options)

  const row = rows[0] ?? {}

  return {
    discussions: Number(row.count__discussions) || 0,
    reviews: Number(row.count__reviews) || 0,
    'data-points': Number(row.count__data_points) || 0,
  }
}
