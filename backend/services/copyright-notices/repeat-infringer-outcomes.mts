import {
  beginTransaction,
  registerPostCommitAction,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { isAdminUser } from '@services/users/authorization'
import {
  accelerateUserSuspensionAfterCommit,
  ensureUserSuspendedInTransaction,
} from '@services/users/suspension'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  recordCopyrightRepeatInfringerDisposition,
  type CopyrightRepeatInfringerDisposition,
} from './repeat-infringer-incidents.mts'

type ReviewDecision = 'warning' | 'no_action' | 'restrict' | 'terminate'

const suspensionReason: Record<'restrict' | 'terminate', string> = {
  restrict: 'Copyright repeat-infringer review recorded restrict',
  terminate: 'Copyright repeat-infringer review recorded terminate',
}

export async function recordCopyrightRepeatInfringerReviewOutcome(
  input: {
    currentUser: PrivateUser
    reviewId: string
    outcome: ReviewDecision
    rationale: string
    recordedAt: Date
  },
  options?: QueryOptions,
): Promise<{
  id: string
  account_user_id: string
  outcome: ReviewDecision
}> {
  const run = async (transaction: TransactionQuery) => {
    const result = await recordCopyrightRepeatInfringerReviewOutcomeInTransaction(
      input,
      transaction,
    )
    if (result.newlySuspended)
      registerPostCommitAction(transaction, () =>
        accelerateUserSuspensionAfterCommit(result.accountUserId),
      )
    return { id: input.reviewId, account_user_id: result.accountUserId, outcome: input.outcome }
  }
  if (options?.query || options?.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}

async function recordCopyrightRepeatInfringerReviewOutcomeInTransaction(
  input: {
    currentUser: PrivateUser
    reviewId: string
    outcome: ReviewDecision
    rationale: string
    recordedAt: Date
  },
  transaction: TransactionQuery,
): Promise<{ accountUserId: string; newlySuspended: boolean }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  const suspendingOutcome =
    input.outcome === 'restrict' || input.outcome === 'terminate' ? input.outcome : null
  if (suspendingOutcome) assert(isAdminUser(input.currentUser), 403, 'Forbidden')
  assertReviewRationale(input.rationale)
  const { rows: identities } = await transaction<{ account_user_id: string }>(sql`
    /* recordCopyrightRepeatInfringerReviewOutcome:identity */
    SELECT account_user_id FROM copyright_repeat_infringer_review_identities
    WHERE id = ${input.reviewId}
  `)
  const identity = identities[0]
  assert(identity, 404, 'Copyright repeat-infringer review not found')
  await lockAuthorPublicationLifecycle(transaction, identity.account_user_id)
  const { rows } = await transaction<{ account_user_id: string; opened_at: Date }>(sql`
    /* recordCopyrightRepeatInfringerReviewOutcome */
    SELECT identity.account_user_id, identity.created_at AS opened_at
    FROM copyright_repeat_infringer_review_identities identity
    JOIN copyright_repeat_infringer_account_states account_state
      ON account_state.account_user_id = identity.account_user_id
      AND account_state.current_open_review_identity_id = identity.id
    WHERE identity.id = ${input.reviewId}
    FOR UPDATE OF account_state
  `)
  const review = rows[0]
  assert(review, 409, 'Copyright repeat-infringer review is already decided')
  let shouldSuspendActiveAccount = false
  if (suspendingOutcome) {
    const { rows: operativeIncidents } = await transaction<{
      id: string
      account_is_active: boolean
    }>(sql`
      /* recordCopyrightRepeatInfringerReviewOutcome:is_operative */
      SELECT id, EXISTS (
        SELECT 1 FROM users WHERE id = ${review.account_user_id} AND deleted_at IS NULL
      ) AS account_is_active
      FROM copyright_repeat_infringer_incidents
      WHERE account_user_id = ${review.account_user_id} AND is_operative
      FOR UPDATE
    `)
    assert(
      operativeIncidents.length >= 2,
      409,
      'Restrict and terminate require two is_operative incidents',
    )
    shouldSuspendActiveAccount = operativeIncidents[0]?.account_is_active ?? false
  }
  const rationaleCiphertext = encryptSecret(
    input.rationale,
    `copyright-repeat-infringer-review:${input.reviewId}`,
  )
  const { rows: updated } = await transaction<{ account_user_id: string }>(sql`
    /* recordCopyrightRepeatInfringerReviewOutcome:history */
    INSERT INTO copyright_repeat_infringer_reviews (
      copyright_repeat_infringer_review_identity_id,
      account_user_id, opened_at, outcome, outcome_at, outcome_by_id,
      rationale_ciphertext
    ) VALUES (
      ${input.reviewId}, ${review.account_user_id}, ${review.opened_at},
      ${input.outcome}, ${input.recordedAt}, ${input.currentUser.id},
      ${rationaleCiphertext}
    )
    RETURNING account_user_id
  `)
  assert(updated[0], 409, 'Copyright repeat-infringer review is already decided')
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
    WHERE account_user_id = ${review.account_user_id}
      AND current_open_review_identity_id = ${input.reviewId}
  `)
  let newlySuspended = false
  if (suspendingOutcome && shouldSuspendActiveAccount) {
    const suspension = await ensureUserSuspendedInTransaction(transaction, {
      actorId: input.currentUser.id,
      userId: review.account_user_id,
      reason: suspensionReason[suspendingOutcome],
    })
    newlySuspended = suspension.newlySuspended
  }
  return { accountUserId: review.account_user_id, newlySuspended }
}

export { recordCopyrightRepeatInfringerReinstatement } from './repeat-infringer-reinstatement.mts'

export async function recordStaffCopyrightRepeatInfringerDisposition(input: {
  currentUser: PrivateUser
  incidentId: string
  disposition: CopyrightRepeatInfringerDisposition
  rationale: string
  recordedAt: Date
}): Promise<{ incident_id: string }> {
  await recordCopyrightRepeatInfringerDisposition(input)
  return { incident_id: input.incidentId }
}

function assertReviewRationale(rationale: string): void {
  assert(rationale.trim() && rationale.length <= 10_000, 422, 'rationale is required')
}
