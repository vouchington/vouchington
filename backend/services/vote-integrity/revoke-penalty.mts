import { write } from '@data-stores/psql'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'

export type VoteWeightPenalty = {
  id: string
  user_id: string
  penalty_multiplier: number
  reason: string
  source_flag_id: string | null
  created_by_id: string
  revoked_at: Date | null
  revoked_by_id: string | null
  created_at: Date
}

export async function revokeVoteWeightPenalty(
  penaltyId: string,
  revokedById: string,
): Promise<VoteWeightPenalty> {
  const { rows } = await write(sql`/* revokeVoteWeightPenalty */
    UPDATE vote_weight_penalties
    SET
      revoked_at = CURRENT_TIMESTAMP,
      revoked_by_id = ${revokedById}
    WHERE id = ${penaltyId}
      AND revoked_at IS NULL
    RETURNING
      id,
      user_id,
      penalty_multiplier,
      reason,
      source_flag_id,
      created_by_id,
      revoked_at,
      revoked_by_id,
      created_at
  `)

  const penalty = rows[0] as VoteWeightPenalty | undefined
  if (!penalty) throw createHttpError(404, 'Penalty not found or already revoked')

  // No JWT invalidation: vote weight is read live, not cached in session claims.
  void enqueueRecalculateUserVoteWeight(penalty.user_id, true)

  return penalty
}
