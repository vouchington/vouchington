import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestRepeatInfringerEnforcementState(input: {
  accountId: string
  reviewId: string
}): Promise<{ outcome: string | null; suspended: boolean }> {
  const { rows } = await write<{ outcome: string | null; suspended: boolean }>(sql`
    /* readTestRepeatInfringerEnforcementState */
    SELECT review.outcome,
      EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = ${input.accountId} AND suspension.lifted_at IS NULL
      ) AS suspended
    FROM copyright_repeat_infringer_reviews review
    WHERE review.id = ${input.reviewId}
  `)
  const state = rows[0]
  if (!state) throw new Error('Repeat-infringer review disappeared')
  return state
}
