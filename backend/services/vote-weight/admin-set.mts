import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function adminSetVoteWeight(userId: string, weight: number): Promise<void> {
  await write(sql`/* adminSetVoteWeight */
    UPDATE users
    SET vote_weight = ${weight},
        vote_weight_admin_set_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
      AND deleted_at IS NULL
  `)
}

export async function adminClearVoteWeight(userId: string): Promise<void> {
  await write(sql`/* adminClearVoteWeight */
    UPDATE users
    SET vote_weight_admin_set_at = NULL
    WHERE id = ${userId}
      AND deleted_at IS NULL
  `)
}
