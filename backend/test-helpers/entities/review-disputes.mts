import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ReviewDisputeReason } from '@ts-shared/utils/moderation-catalogs'

type ReviewDisputeSubjectMutation = { disputeId: string } & (
  | { postId: string }
  | { topicId: string }
  | { disputedRating: number }
)

export async function insertTestReviewDispute(input: {
  postId: string
  topicId: string
  disputantUserId: string
  reason?: ReviewDisputeReason
  claimText?: string
}): Promise<string> {
  const reason = input.reason ?? 'other'
  const claimText = input.claimText ?? 'Test review dispute fixture.'
  const { rows } = await write<{ id: string }>(sql`/* insertTestReviewDispute */
    WITH ids AS (
      SELECT uuidv7() AS dispute_id, uuidv7() AS lifecycle_change_id
    ),
    inserted_dispute AS (
      INSERT INTO review_disputes (
        id, post_id, topic_id, disputed_rating, disputant_user_id, reason, claim_text,
        latest_lifecycle_change_id
      )
      SELECT
        ids.dispute_id,
        ${input.postId},
        ${input.topicId},
        rating.rating,
        ${input.disputantUserId},
        ${reason},
        ${claimText},
        ids.lifecycle_change_id
      FROM ids
      JOIN post_review_topic_ratings rating
        ON rating.post_id = ${input.postId}
        AND rating.topic_id = ${input.topicId}
      RETURNING id
    ),
    inserted_change AS (
      INSERT INTO review_dispute_lifecycle_changes (
        id, review_dispute_id, change_type, changed_by_id, metadata
      )
      SELECT
        ids.lifecycle_change_id,
        inserted_dispute.id,
        'create',
        ${input.disputantUserId},
        '{}'::jsonb
      FROM ids
      CROSS JOIN inserted_dispute
    )
    SELECT id FROM inserted_dispute
  `)
  const disputeId = rows[0]?.id
  if (!disputeId) throw new Error('Review rating not found for test dispute')
  return disputeId
}

export async function updateTestReviewDisputeSubject(
  input: ReviewDisputeSubjectMutation,
): Promise<void> {
  const query = sql`/* updateTestReviewDisputeSubject */
    UPDATE review_disputes SET`
  if ('postId' in input) {
    query.append(sql` post_id = ${input.postId}`)
  } else if ('topicId' in input) {
    query.append(sql` topic_id = ${input.topicId}`)
  } else {
    query.append(sql` disputed_rating = ${input.disputedRating}`)
  }
  query.append(sql` WHERE id = ${input.disputeId}`)
  await write(query)
}
