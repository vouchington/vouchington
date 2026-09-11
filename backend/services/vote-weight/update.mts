import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { gatherVoteWeightFactors } from './gather-factors.mts'
import { calculateVoteWeight } from './calculate.mts'

export async function recalculateUserVoteWeight(
  userId: string,
  opts?: { forceRecalculate?: boolean; readFromWriter?: boolean },
): Promise<{ weight: number; changed: boolean }> {
  const factors = await gatherVoteWeightFactors(userId, { readFromWriter: opts?.readFromWriter })
  if (!factors) return { weight: 1, changed: false }

  if (factors.vote_weight_admin_set_at && !opts?.forceRecalculate) {
    return { weight: factors.current_weight, changed: false }
  }

  const weight = calculateVoteWeight(factors)
  const changed = weight !== factors.current_weight

  if (opts?.forceRecalculate) {
    await write(sql`/* recalculateUserVoteWeight */
      UPDATE users
      SET vote_weight = ${weight},
          vote_weight_recalculated_at = CURRENT_TIMESTAMP,
          vote_weight_admin_set_at = NULL
      WHERE id = ${userId}
        AND deleted_at IS NULL
    `)
  } else {
    await write(sql`/* recalculateUserVoteWeight */
      UPDATE users
      SET vote_weight = ${weight},
          vote_weight_recalculated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
        AND deleted_at IS NULL
    `)
  }

  return { weight, changed }
}
