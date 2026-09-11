import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import onError from '@modules/on-error'
import type { ReviewDispute } from './config.mts'
import type { CreateReviewDisputeInput } from './parse.mts'
import { currentUserCanDisputeReviewsOfTopic } from '@services/topic-claims/authorization'
import type { PrivateUser } from '@services/users/types'
import { getReviewDisputeByIdFromPrimary } from './get.mts'
import type { ReviewDisputeResponse } from './types.mts'

export async function createReviewDispute(
  currentUser: PrivateUser,
  input: CreateReviewDisputeInput,
): Promise<{ dispute: ReviewDisputeResponse; isDuplicate: boolean }> {
  await using query = await beginTransaction()
  // The post and selected rating are resolved from the primary. A row lock on the rating then
  // keeps the captured value stable until the dispute insert commits.
  const getPostQuery = sql`/* createReviewDispute:getPost */
      SELECT p.id, p.post_type, p.deleted_at, selected_rating.topic_id
      FROM posts p
      LEFT JOIN LATERAL (
        SELECT prtr.topic_id
        FROM post_review_topic_ratings prtr
        WHERE prtr.post_id = p.id`
  if (input.topicId) {
    getPostQuery.append(sql` AND prtr.topic_id = ${input.topicId}`)
  }
  getPostQuery.append(sql`
        ORDER BY prtr.order_index, prtr.topic_id
        LIMIT 1
      ) selected_rating ON true
      WHERE p.id = ${input.postId}
      LIMIT 1
      FOR SHARE OF p
    `)
  const { rows: postRows } = await query(getPostQuery)
  const postRow = postRows[0] as
    | {
        id: string
        post_type: string
        deleted_at: Date | null
        topic_id: string | null
      }
    | undefined
  assert(postRow, 404, 'Post not found')
  assert(postRow.post_type === 'review', 422, 'Only review posts can be disputed')
  assert(!postRow.deleted_at, 410, 'Post has been deleted')
  assert(
    postRow.topic_id,
    422,
    input.topicId ? 'Review has no rating for the specified topic' : 'Review has no topic rating',
  )

  const topicId = postRow.topic_id
  const { rows: ratingRows } = await query(sql`/* createReviewDispute:lockRating */
      SELECT rating
      FROM post_review_topic_ratings
      WHERE post_id = ${input.postId}
        AND topic_id = ${topicId}
      FOR SHARE
    `)
  const disputedRating = (ratingRows[0] as { rating: number } | undefined)?.rating
  assert(disputedRating !== undefined, 422, 'Review has no topic rating')

  const canDispute = await currentUserCanDisputeReviewsOfTopic(currentUser, topicId)
  assert(canDispute, 403, 'You must have a verified claim on this topic to file a dispute')

  const { rows } = await query(sql`/* createReviewDispute */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    upserted AS (
      INSERT INTO review_disputes (
        post_id, topic_id, disputed_rating, disputant_user_id, reason, claim_text,
        latest_lifecycle_change_id
      )
      VALUES (
        ${input.postId}, ${topicId}, ${disputedRating}, ${currentUser.id}, ${input.reason}, ${input.claimText},
        (SELECT id FROM lifecycle_change_id)
      )
      ON CONFLICT (disputant_user_id, post_id, topic_id)
      WHERE resolved_at IS NULL
      DO UPDATE SET
        reason = EXCLUDED.reason,
        claim_text = EXCLUDED.claim_text,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        (xmax = 0) AS inserted,
        id, post_id, topic_id, disputant_user_id, reason, claim_text,
        CASE
          WHEN resolved_at IS NULL THEN 'pending'
          WHEN resolution_action = 'dismiss' THEN 'dismissed'
          ELSE 'resolved'
        END AS status,
        recommended_action, ai_public_response, ai_internal_response, model, ai_drafted_at,
        public_response, internal_notes, drafted_at, edited_at, edited_by_id,
        approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
        resolution_action, latest_lifecycle_change_id, updated_at
    ),
    inserted_change AS (
      INSERT INTO review_dispute_lifecycle_changes (
        id,
        review_dispute_id,
        change_type,
        changed_by_id,
        drafted_at,
        edited_at,
        approved_at,
        sent_at,
        resolved_at,
        resolution_action,
        metadata
      )
      SELECT
        lifecycle_change_id.id,
        upserted.id,
        'create',
        ${currentUser.id},
        upserted.drafted_at,
        upserted.edited_at,
        upserted.approved_at,
        upserted.sent_at,
        upserted.resolved_at,
        upserted.resolution_action,
        '{}'::jsonb
      FROM upserted
      CROSS JOIN lifecycle_change_id
      WHERE upserted.inserted
    )
    SELECT
      inserted,
      id, post_id, topic_id, disputant_user_id, reason, claim_text, status,
      recommended_action, ai_public_response, ai_internal_response, model, ai_drafted_at,
      public_response, internal_notes, drafted_at, edited_at, edited_by_id,
      approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
      resolution_action, latest_lifecycle_change_id, updated_at
    FROM upserted
  `)

  const row = rows[0] as (ReviewDispute & { inserted: boolean }) | undefined
  assert(row, 500, 'Failed to create dispute')
  const result = { disputeId: row.id, isDuplicate: !row.inserted }
  await query.commit()

  if (!result.isDuplicate) {
    enqueueDisputeResolutionAsync(result.disputeId)
  }
  const dispute = await getReviewDisputeByIdFromPrimary(result.disputeId)
  assert(dispute, 500, 'Dispute disappeared after creation')
  return { dispute, isDuplicate: result.isDuplicate }
}

function enqueueDisputeResolutionAsync(disputeId: string): void {
  import('@queues/ai-agents/enqueues/dispute-resolution')
    .then(({ enqueueDisputeResolution }) => {
      enqueueDisputeResolution(disputeId)
    })
    .catch(onError)
}
