import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// vote_weight_admin_set_at makes recalculateUserVoteWeight keep this weight.
// This stays out of @services/vote-weight: that package already depends on elections-votes.
export async function setTestUserAdminVoteWeight(
  userId: string,
  voteWeight: number,
): Promise<void> {
  await write(sql`/* setTestUserAdminVoteWeight */
    UPDATE users
    SET vote_weight = ${voteWeight},
        vote_weight_admin_set_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
  `)
}
