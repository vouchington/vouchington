import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Persist the current account decision while keeping its review history finite. */
export async function recordCurrentCopyrightRepeatInfringerOutcome(
  transaction: TransactionQuery,
  input: {
    reviewId: string
    outcome: 'warning' | 'no_action' | 'restrict' | 'terminate'
    recordedAt: Date
    currentUser: { id: string }
  },
  accountUserId: string,
  rationaleCiphertext: string,
): Promise<void> {
  await transaction(sql`
    /* recordCopyrightRepeatInfringerReviewOutcome:current */
    UPDATE copyright_repeat_infringer_account_states
    SET current_open_review_identity_id = NULL,
      current_decided_review_identity_id = ${input.reviewId},
      current_outcome = ${input.outcome},
      current_outcome_at = ${input.recordedAt},
      current_outcome_by_id = ${input.currentUser.id},
      current_outcome_rationale_ciphertext = ${rationaleCiphertext},
      effective_termination_rationale_ciphertext = CASE
        WHEN ${input.outcome} = 'terminate' THEN ${rationaleCiphertext}::text
        ELSE effective_termination_rationale_ciphertext
      END,
      effective_termination_review_identity_id = CASE
        WHEN ${input.outcome} = 'terminate' THEN ${input.reviewId}::uuid
        ELSE effective_termination_review_identity_id
      END,
      effective_termination_decided_at = CASE
        WHEN ${input.outcome} = 'terminate' THEN ${input.recordedAt}::timestamptz
        ELSE effective_termination_decided_at
      END,
      effective_termination_decided_by_id = CASE
        WHEN ${input.outcome} = 'terminate' THEN ${input.currentUser.id}::uuid
        ELSE effective_termination_decided_by_id
      END,
      is_termination_in_effect = CASE
        WHEN ${input.outcome} = 'terminate' THEN true
        ELSE is_termination_in_effect
      END
    WHERE account_user_id = ${accountUserId}
      AND current_open_review_identity_id = ${input.reviewId}
  `)
}
