import assert from 'http-assert'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createPostRevision } from '@services/post-revisions'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueOnPostDeleted } from '@queues/entity-listeners/enqueues'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'
import { currentUserCanWithdrawTopicRecommendation } from './authorization.mts'
import type { TopicRecommendationPost } from './types.mts'

export function getWithdrawRejectionReason(
  currentUser: PrivateUser,
  recommendation: TopicRecommendationPost,
): string {
  return currentUser.id === recommendation.created_by_id
    ? 'Withdrawn by author'
    : 'Withdrawn by admin'
}

export async function deletePendingRecommendation(
  currentUser: PrivateUser,
  recommendation: TopicRecommendationPost,
): Promise<void> {
  assert(currentUserCanWithdrawTopicRecommendation(currentUser, recommendation), 403, 'Forbidden')
  assert(recommendation.topic_recommendation.status === 'pending', 403, 'Forbidden')
  const rejectionReason = getWithdrawRejectionReason(currentUser, recommendation)

  await using query = await beginTransaction()
  await lockPostPublication(query, recommendation.id)
  // The UPDATE re-evaluates reviewed_at after waiting on the row lock. A separate
  // SELECT FOR UPDATE would snapshot the row from before that wait.
  const { rows } = await query<{ reviewed_count: number; deleted_count: number }>(
    sql`/* deletePendingRecommendation */
      WITH reviewed AS (
        UPDATE post_topic_recommendations
        SET reviewed_at = NOW(),
          reviewed_by_id = ${currentUser.id},
          approval_error_message = NULL,
          rejection_reason = ${rejectionReason},
          created_topic_id = NULL
        WHERE post_id = ${recommendation.id}
          AND reviewed_at IS NULL
        RETURNING post_id
      ),
      deleted AS (
        UPDATE posts
        SET deleted_at = CURRENT_TIMESTAMP,
          deleted_by_id = ${currentUser.id}
        WHERE id IN (SELECT post_id FROM reviewed)
          AND deleted_at IS NULL
        RETURNING id
      )
      SELECT
        (SELECT COUNT(*)::int FROM reviewed) AS reviewed_count,
        (SELECT COUNT(*)::int FROM deleted) AS deleted_count
    `,
  )
  assert(
    (rows[0]?.reviewed_count ?? 0) === 1 && (rows[0]?.deleted_count ?? 0) === 1,
    403,
    'Forbidden',
  )

  await recordPostPublicationChange(query, {
    scope: { type: 'post', postId: recommendation.id },
    reason: 'post_deleted',
  })

  await createPostRevision(
    recommendation.id,
    'delete',
    { deleted_at: { before: null, after: 'now' } },
    currentUser.id,
    { query },
  )
  await query.commit()

  await invalidate.posts(recommendation.id)
  void enqueueOnPostDeleted(recommendation.id)
}
