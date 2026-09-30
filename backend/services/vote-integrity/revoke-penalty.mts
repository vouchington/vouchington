import { recordModeratorAction } from '@services/moderator-actions'
import { beginTransaction } from '@data-stores/psql'
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
  await using transaction = await beginTransaction()
  const { rows } = await transaction(sql`/* revokeVoteWeightPenalty */
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

  await recordModeratorAction(
    revokedById,
    {
      actionType: 'vote_integrity_penalty_revoke',
      voteWeightPenaltyId: penaltyId,
      metadata: { before: { revoked_at: null }, after: { revoked_at: penalty.revoked_at } },
    },
    { query: transaction },
  )
  await transaction.commit()
  // No JWT invalidation: vote weight is read live, not cached in session claims.
  void enqueueRecalculateUserVoteWeight(penalty.user_id, true)

  return penalty
}
