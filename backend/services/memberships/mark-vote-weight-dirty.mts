import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Keep family-factor recovery in the transaction that changed the factor. */
export async function markVoteWeightDirtyInTransaction(
  userId: string,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* markVoteWeightDirtyInTransaction */
    UPDATE users SET vote_weight_recalculated_at = NULL WHERE id = ${userId}`)
}
