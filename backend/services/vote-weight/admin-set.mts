import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { beginTransaction } from '@data-stores/psql'
import { recordModeratorAction } from '@services/moderator-actions'
import sql from 'sql-template-strings'

export async function adminSetVoteWeight(
  currentUserId: string,
  userId: string,
  weight: number,
): Promise<void> {
  assert(
    typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && weight <= 1_000_000,
    400,
    'Invalid weight value',
  )
  assert(isUUID(userId), 422, 'Invalid user ID')
  await using query = await beginTransaction()
  const { rows } = await query<{
    vote_weight: number
    vote_weight_admin_set_at: Date | null
  }>(sql`/* adminVoteWeightPreviousState */
    SELECT vote_weight, vote_weight_admin_set_at FROM users
    WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE
  `)
  assert(rows[0], 404, 'User not found')
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
  assert(isUUID(userId), 422, 'Invalid user ID')
  await using query = await beginTransaction()
  const { rows } = await query<{
    vote_weight: number
    vote_weight_admin_set_at: Date | null
  }>(sql`/* adminVoteWeightPreviousState */
    SELECT vote_weight, vote_weight_admin_set_at FROM users
    WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE
  `)
  assert(rows[0], 404, 'User not found')
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
