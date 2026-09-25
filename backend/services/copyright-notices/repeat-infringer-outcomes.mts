import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { CONFLICT } from '@modules/on-error/error-codes'
import { isAdminUser } from '@services/users/authorization'
import { suspendUser } from '@services/users/suspension'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  recordCopyrightRepeatInfringerDisposition,
  type CopyrightRepeatInfringerDisposition,
} from './repeat-infringer-incidents.mts'

export type CopyrightRepeatInfringerReviewDecision =
  | 'warning'
  | 'no_action'
  | 'restrict'
  | 'terminate'

const suspensionReason: Record<'restrict' | 'terminate', string> = {
  restrict: 'Copyright repeat-infringer review recorded restrict',
  terminate: 'Copyright repeat-infringer review recorded terminate',
}

export async function recordCopyrightRepeatInfringerReviewOutcome(input: {
  currentUser: PrivateUser
  reviewId: string
  outcome: CopyrightRepeatInfringerReviewDecision
  rationale: string
  recordedAt: Date
}): Promise<{
  id: string
  account_user_id: string
  outcome: CopyrightRepeatInfringerReviewDecision
}> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  const suspends = input.outcome === 'restrict' || input.outcome === 'terminate'
  if (suspends) assert(isAdminUser(input.currentUser), 403, 'Forbidden')
  assertReviewRationale(input.rationale)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ account_user_id: string }>(sql`
    /* recordCopyrightRepeatInfringerReviewOutcome */
    SELECT account_user_id FROM copyright_repeat_infringer_reviews
    WHERE id = ${input.reviewId}
    FOR UPDATE
  `)
  const review = rows[0]
  assert(review, 404, 'Copyright repeat-infringer review not found')
  if (suspends) {
    const { rows: operative } = await transaction<{ id: string }>(sql`
      /* recordCopyrightRepeatInfringerReviewOutcome:operative */
      SELECT id FROM copyright_repeat_infringer_incidents
      WHERE account_user_id = ${review.account_user_id} AND operative
      FOR UPDATE
    `)
    assert(operative.length >= 2, 409, 'Restrict and terminate require two operative incidents')
  }
  const { rows: updated } = await transaction<{ account_user_id: string }>(sql`
    /* recordCopyrightRepeatInfringerReviewOutcome:update */
    UPDATE copyright_repeat_infringer_reviews
    SET outcome = ${input.outcome},
      outcome_at = ${input.recordedAt},
      outcome_by_id = ${input.currentUser.id},
      rationale_ciphertext = ${encryptSecret(
        input.rationale,
        `copyright-repeat-infringer-review:${input.reviewId}`,
      )},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${input.reviewId} AND outcome IS NULL
    RETURNING account_user_id
  `)
  assert(updated[0], 409, 'Copyright repeat-infringer review is already decided')
  await transaction.commit()
  if (suspends) {
    await suspendUnlessAlreadySuspended(
      input.currentUser,
      review.account_user_id,
      suspensionReason[input.outcome],
    )
  }
  return { id: input.reviewId, account_user_id: review.account_user_id, outcome: input.outcome }
}

export async function recordCopyrightRepeatInfringerReinstatement(input: {
  currentUser: PrivateUser
  accountUserId: string
  rationale: string
  recordedAt: Date
}): Promise<{ account_user_id: string; outcome: 'reinstatement' }> {
  assert(isAdminUser(input.currentUser), 403, 'Forbidden')
  assertReviewRationale(input.rationale)
  await using transaction = await beginTransaction()
  await transaction(sql`
    /* recordCopyrightRepeatInfringerReinstatement:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${input.accountUserId}, 1))
  `)
  const { rows: blocked } = await transaction<{ id: string }>(sql`
    /* recordCopyrightRepeatInfringerReinstatement */
    SELECT id FROM copyright_repeat_infringer_reviews terminated
    WHERE terminated.account_user_id = ${input.accountUserId}
      AND terminated.outcome = 'terminate'
      AND NOT EXISTS (
        SELECT 1 FROM copyright_repeat_infringer_reviews reinstated
        WHERE reinstated.account_user_id = terminated.account_user_id
          AND reinstated.outcome = 'reinstatement'
          AND reinstated.outcome_at > terminated.outcome_at
      )
    FOR UPDATE
  `)
  assert(blocked[0], 409, 'Copyright termination is not in effect')
  await transaction(sql`
    /* recordCopyrightRepeatInfringerReinstatement:insert */
    INSERT INTO copyright_repeat_infringer_reviews (
      account_user_id, opened_at, outcome, outcome_at, outcome_by_id, rationale_ciphertext
    ) VALUES (
      ${input.accountUserId}, ${input.recordedAt}, 'reinstatement', ${input.recordedAt},
      ${input.currentUser.id},
      ${encryptSecret(
        input.rationale,
        `copyright-repeat-infringer-reinstatement:${input.accountUserId}:${input.recordedAt.toISOString()}`,
      )}
    )
  `)
  await transaction.commit()
  return { account_user_id: input.accountUserId, outcome: 'reinstatement' }
}

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

async function suspendUnlessAlreadySuspended(
  currentUser: PrivateUser,
  accountUserId: string,
  reason: string,
): Promise<void> {
  try {
    await suspendUser(currentUser, accountUserId, reason)
  } catch (error) {
    if (!isAlreadySuspended(error)) throw error
  }
}

function isAlreadySuspended(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 409 &&
    'code' in error &&
    error.code === CONFLICT
  )
}
