import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function endTestMembershipProjection(membershipId: string): Promise<void> {
  await write(sql`/* endTestMembershipProjection */
    UPDATE memberships
    SET projection_ended_at = CURRENT_TIMESTAMP
    WHERE id = ${membershipId}
  `)
}
