import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestRepeatInfringerEnforcementState(input: {
  accountId: string
  reviewId: string
}): Promise<{ outcome: string | null; suspended: boolean }> {
  const { rows } = await write<{ outcome: string | null; suspended: boolean }>(sql`
    /* readTestRepeatInfringerEnforcementState */
    SELECT CASE WHEN account_state.current_decided_review_identity_id = ${input.reviewId}
        THEN account_state.current_outcome ELSE review.outcome END AS outcome,
      EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = ${input.accountId} AND suspension.lifted_at IS NULL
      ) AS suspended
    FROM copyright_repeat_infringer_review_identities identity
    LEFT JOIN copyright_repeat_infringer_account_states account_state
      ON account_state.account_user_id = identity.account_user_id
    LEFT JOIN copyright_repeat_infringer_reviews review
      ON review.copyright_repeat_infringer_review_identity_id = identity.id
    WHERE identity.id = ${input.reviewId}
  `)
  const state = rows[0]
  if (!state) throw new Error('Repeat-infringer review disappeared')
  return state
}
