import { FINAL_USER_PURGE_LOCK_KEY } from '@modules/utils/final-user-purge-lock'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { isAdminUser } from '@services/users/authorization'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import type { PrivateUser } from '@services/users/types'

export async function recordCopyrightRepeatInfringerReinstatement(
  input: {
    currentUser: PrivateUser
    accountUserId: string
    rationale: string
    recordedAt: Date
  },
  transactionOptions: Parameters<typeof beginTransaction>[0] = {},
): Promise<{ account_user_id: string; outcome: 'reinstatement' }> {
  assert(isAdminUser(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim() && input.rationale.length <= 10_000, 422, 'rationale is required')
  await using transaction = await beginTransaction(transactionOptions)
  await lockCopyrightReinstatementLifetime(transaction, input.accountUserId)
  const { rows: blocked } = await transaction<{ id: string }>(sql`
    /* recordCopyrightRepeatInfringerReinstatement */
    SELECT account_user_id AS id FROM copyright_repeat_infringer_account_states
    WHERE account_user_id = ${input.accountUserId} AND is_termination_in_effect
    FOR UPDATE
  `)
  assert(blocked[0], 409, 'Copyright termination is not in effect')
  const { rows: identities } = await transaction<{ id: string }>(sql`
    /* recordCopyrightRepeatInfringerReinstatement:identity */
    INSERT INTO copyright_repeat_infringer_review_identities (account_user_id)
    VALUES (${input.accountUserId}) RETURNING id
  `)
  const rationaleCiphertext = encryptSecret(
    input.rationale,
    `copyright-repeat-infringer-reinstatement:${input.accountUserId}:${input.recordedAt.toISOString()}`,
  )
  await recordCopyrightReinstatementDecision(
    transaction,
    input,
    identities[0]!.id,
    rationaleCiphertext,
  )
  await authorizeAndCommitCopyrightReinstatement(transaction, input)
  return { account_user_id: input.accountUserId, outcome: 'reinstatement' }
}

/** Lock account-wide retention before publication and account state work. */
async function lockCopyrightReinstatementLifetime(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  accountUserId: string,
): Promise<void> {
  await transaction(
    sql`/* lockCopyrightReinstatementRetentionLifetime */ SELECT pg_advisory_xact_lock(hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0))`,
  )
  await lockAuthorPublicationLifecycle(transaction, accountUserId)
}

/** Persist the retained current decision before its finite audit review. */
async function recordCopyrightReinstatementDecision(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  input: Parameters<typeof recordCopyrightRepeatInfringerReinstatement>[0],
  reviewId: string,
  rationaleCiphertext: string,
): Promise<void> {
  await transaction(sql`
    /* recordCopyrightRepeatInfringerReinstatement:current */
    UPDATE copyright_repeat_infringer_account_states
    SET is_termination_in_effect = false, current_outcome = 'reinstatement',
      current_outcome_at = ${input.recordedAt}, current_outcome_by_id = ${input.currentUser.id},
      current_outcome_rationale_ciphertext = ${rationaleCiphertext},
      current_decided_review_identity_id = ${reviewId},
      effective_termination_review_identity_id = NULL,
      effective_termination_decided_at = NULL,
      effective_termination_decided_by_id = NULL, effective_termination_rationale_ciphertext = NULL
    WHERE account_user_id = ${input.accountUserId} AND is_termination_in_effect
  `)
  await transaction(sql`
    /* recordCopyrightRepeatInfringerReinstatement:insert */
    INSERT INTO copyright_repeat_infringer_reviews (
      copyright_repeat_infringer_review_identity_id,
      account_user_id, opened_at, outcome, outcome_at, outcome_by_id, rationale_ciphertext
    ) VALUES (
      ${reviewId}, ${input.accountUserId}, ${input.recordedAt}, 'reinstatement', ${input.recordedAt},
      ${input.currentUser.id},
      ${rationaleCiphertext}
    )
  `)
}

/** Reinstatement releases active suspension reliance only after its final decision is recorded. */
async function authorizeAndCommitCopyrightReinstatement(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  input: Parameters<typeof recordCopyrightRepeatInfringerReinstatement>[0],
): Promise<void> {
  await transaction(sql`/* authorizeCopyrightSuspensionReinstatement */
    UPDATE copyright_account_suspension_reliances SET reinstated_at = ${input.recordedAt}
    WHERE account_user_id = ${input.accountUserId} AND reinstated_at IS NULL AND released_at IS NULL`)
  await transaction.commit()
}
