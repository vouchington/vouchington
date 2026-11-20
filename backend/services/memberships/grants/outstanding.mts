import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { membershipAdditionalWorkMaxValues } from '../work-limits.mts'

/** Reads up to the hard ceiling so lowering the configured cap never hides existing grants. */
export async function getOutstandingMembershipGrantIds(
  userId: string,
  query: QueryExecutor,
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(sql`/* getOutstandingMembershipGrantIds */
    SELECT grant_row.id
    FROM membership_grants grant_row
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = grant_row.membership_source_id
    WHERE grant_row.user_id = ${userId}
      AND grant_row.revoked_at IS NULL AND source_state.expired_at IS NULL
    ORDER BY grant_row.id
    LIMIT ${membershipAdditionalWorkMaxValues.outstanding_grants_per_user}`)
  return rows.map(row => row.id)
}
