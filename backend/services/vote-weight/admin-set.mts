import { beginTransaction } from '@data-stores/psql'
import { recordModeratorAction } from '@services/moderator-actions'
import sql from 'sql-template-strings'

export async function adminSetVoteWeight(
  currentUserId: string,
  userId: string,
  weight: number,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{
    vote_weight: number
    vote_weight_admin_set_at: Date | null
  }>(sql`/* adminVoteWeightPreviousState */
    SELECT vote_weight, vote_weight_admin_set_at FROM users
    WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE
  `)
  if (!rows[0]) return
  await query(sql`/* adminSetVoteWeight */
    UPDATE users SET vote_weight = ${weight}, vote_weight_admin_set_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
  `)
  await recordModeratorAction(
    currentUserId,
    {
      actionType: 'vote_weight_set',
      targetUserId: userId,
      metadata: { before: rows[0], after: { vote_weight: weight, admin_set: true } },
    },
    { query },
  )
  await query.commit()
}

export async function adminClearVoteWeight(currentUserId: string, userId: string): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{
    vote_weight: number
    vote_weight_admin_set_at: Date | null
  }>(sql`/* adminVoteWeightPreviousState */
    SELECT vote_weight, vote_weight_admin_set_at FROM users
    WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE
  `)
  if (!rows[0]) return
  await query(sql`/* adminClearVoteWeight */
    UPDATE users SET vote_weight_admin_set_at = NULL WHERE id = ${userId}
  `)
  await recordModeratorAction(
    currentUserId,
    {
      actionType: 'vote_weight_reset',
      targetUserId: userId,
      metadata: {
        before: rows[0],
        after: { vote_weight: rows[0].vote_weight, vote_weight_admin_set_at: null },
      },
    },
    { query },
  )
  await query.commit()
}
