import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function endTestMembershipProjection(membershipId: string): Promise<void> {
  await write(sql`/* endTestMembershipProjection */
    UPDATE memberships
    SET projection_ended_at = CURRENT_TIMESTAMP
    WHERE id = ${membershipId}
  `)
}
