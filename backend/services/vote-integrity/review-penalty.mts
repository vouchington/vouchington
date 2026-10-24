import { write } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { VoteWeightPenalty } from './revoke-penalty.mts'

/** Oldest due active penalties form a bounded staff review queue. */
export async function getVoteWeightPenaltyReviewsDue(): Promise<{
  results: VoteWeightPenalty[]
  has_more: boolean
}> {
  const { rows } = await write<VoteWeightPenalty>(sql`/* getVoteWeightPenaltyReviewsDue */
    SELECT id, user_id, penalty_multiplier, reason, source_flag_id, created_by_id,
      revoked_at, revoked_by_id, reviewed_at, reviewed_by_id, review_due_at, created_at
    FROM vote_weight_penalties
    WHERE revoked_at IS NULL AND review_due_at <= CURRENT_TIMESTAMP
    ORDER BY review_due_at, id LIMIT 26
  `)
  return { results: rows.slice(0, 25), has_more: rows.length > 25 }
}

/** Confirm that an active penalty remains warranted, scheduling its next annual review. */
export async function reviewVoteWeightPenalty(
  penaltyId: string,
  reviewedById: string,
): Promise<VoteWeightPenalty> {
  const { rows } = await write<VoteWeightPenalty>(sql`/* reviewVoteWeightPenalty */
    UPDATE vote_weight_penalties
    SET reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by_id = ${reviewedById},
        review_due_at = CURRENT_TIMESTAMP + interval '12 months'
    WHERE id = ${penaltyId} AND revoked_at IS NULL
      AND review_due_at <= CURRENT_TIMESTAMP
    RETURNING id, user_id, penalty_multiplier, reason, source_flag_id, created_by_id,
      revoked_at, revoked_by_id, reviewed_at, reviewed_by_id, review_due_at, created_at
  `)
  const penalty = rows[0]
  if (!penalty) throw createHttpError(404, 'Active vote weight penalty not found')
  return penalty
}
