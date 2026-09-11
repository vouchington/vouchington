import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function retireCurrentMembershipProjection(
  userId: string,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* retireCurrentMembershipProjection */
    UPDATE memberships
    SET projection_ended_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId} AND projection_ended_at IS NULL`)
}
