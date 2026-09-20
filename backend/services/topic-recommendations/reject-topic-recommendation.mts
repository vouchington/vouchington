import type { PrivateUser } from '@voucha/types/entities/user'
import type { TopicRecommendationPost } from './types.mts'
import assert from 'http-assert'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getPostByAny } from '@services/posts'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'

export async function rejectTopicRecommendation(
  currentUser: PrivateUser,
  recommendation: TopicRecommendationPost,
  reason?: string,
): Promise<TopicRecommendationPost> {
  assert(currentUser.roles.includes('administrator'), 403, 'Admin access required')
  assert(
    recommendation.topic_recommendation.status === 'pending',
    422,
    'Recommendation is already reviewed',
  )

  await using query = await beginTransaction()
  const options = { query }
  const lockedStatusQuery = await query(sql`/* rejectTopicRecommendation */
      SELECT reviewed_at
      FROM post_topic_recommendations
      WHERE post_id = ${recommendation.id}
      FOR UPDATE
    `)
  const reviewedAt = lockedStatusQuery.rows[0]?.reviewed_at
  assert(reviewedAt === null, 422, 'Recommendation is already reviewed')

  const result = await write(
    sql`/* rejectTopicRecommendation */
        UPDATE post_topic_recommendations
        SET reviewed_at = NOW(),
          reviewed_by_id = ${currentUser.id},
          approval_error_message = NULL,
          rejection_reason = ${reason?.trim() || null},
          created_topic_id = NULL
        WHERE post_id = ${recommendation.id}
          AND reviewed_at IS NULL
      `,
    options,
  )
  assert(result.rowCount === 1, 422, 'Recommendation is already reviewed')

  const reloaded = await getPostByAny(recommendation.id, options)
  assert(
    reloaded?.post_type === 'topic_recommendation' && reloaded.topic_recommendation,
    500,
    'Failed to reload rejected recommendation',
  )
  const rejected = reloaded as TopicRecommendationPost
  await query.commit()

  await invalidate.posts(recommendation.id)
  void enqueueOnPostUpdated(recommendation.id)

  return rejected
}
