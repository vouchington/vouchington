import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { gatherVoteWeightFactors } from './gather-factors.mts'
import { calculateVoteWeight } from './calculate.mts'

export async function recalculateUserVoteWeight(
  userId: string,
  opts?: { forceRecalculate?: boolean; readFromWriter?: true; query?: QueryExecutor },
): Promise<{ weight: number; changed: boolean }> {
  const query = opts?.query ?? write
  const { rows: versions } = await query<{
    version: string
  }>(sql`/* recalculateUserVoteWeight:version */
    SELECT xmin::text AS version FROM users
    WHERE id = ${userId} AND deleted_at IS NULL`)
  const version = versions[0]?.version
  if (!version) return { weight: 1, changed: false }

  // The version and factors use the writer. Holding a transaction across the gather can
  // exhaust the pool because factor gathering borrows another writer connection.
  const factors = await gatherVoteWeightFactors(userId, {
    readFromWriter: opts?.readFromWriter ?? true,
  })
  if (!factors) return { weight: 1, changed: false }

  if (factors.vote_weight_admin_set_at && !opts?.forceRecalculate) {
    return { weight: factors.current_weight, changed: false }
  }

  const weight = calculateVoteWeight(factors)
  let applied: boolean | undefined
  if (opts?.forceRecalculate) {
    const { rows } = await query<{ applied: boolean }>(sql`/* recalculateUserVoteWeight:apply */
      UPDATE users
      SET vote_weight = CASE WHEN users.xmin::text = ${version}
            THEN ${weight} ELSE vote_weight END,
          vote_weight_recalculated_at = CASE WHEN users.xmin::text = ${version}
            THEN CURRENT_TIMESTAMP ELSE NULL END,
          vote_weight_admin_set_at = CASE WHEN users.xmin::text = ${version}
            THEN NULL ELSE vote_weight_admin_set_at END
      WHERE id = ${userId}
        AND deleted_at IS NULL
      RETURNING vote_weight_recalculated_at IS NOT NULL AS applied
    `)
    applied = rows[0]?.applied
  } else {
    const { rows } = await query<{ applied: boolean }>(sql`/* recalculateUserVoteWeight:apply */
      UPDATE users
      SET vote_weight = CASE WHEN users.xmin::text = ${version}
            AND vote_weight_admin_set_at IS NULL THEN ${weight} ELSE vote_weight END,
          vote_weight_recalculated_at = CASE WHEN users.xmin::text = ${version}
            AND vote_weight_admin_set_at IS NULL THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = ${userId}
        AND deleted_at IS NULL
      RETURNING vote_weight_recalculated_at IS NOT NULL AS applied
    `)
    applied = rows[0]?.applied
  }

  if (applied === undefined) return { weight: factors.current_weight, changed: false }
  if (!applied) throw new Error('Vote-weight recalculation raced with a newer user change')
  return { weight, changed: weight !== factors.current_weight }
}
