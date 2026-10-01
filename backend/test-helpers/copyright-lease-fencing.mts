import { createTestUser } from './index.mts'
import { createParsedCopyrightEmailIntake } from '../services/copyright-notices/email-intake-test-fixtures.mts'
import { rejectCopyrightEmailIntake } from '../services/copyright-notices/email-rejection.mts'
import { beginTransaction, read, write } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { completeCopyrightActionIntentInTransaction } from '../services/copyright-notices/action-delivery-locking.mts'

export async function expireTestCopyrightEnforcementClaim(assessmentId: string): Promise<void> {
  await write(sql`/* expireTestCopyrightEnforcementClaim */
    UPDATE copyright_notice_enforcement_requests
    SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '16 minutes'
    WHERE copyright_notice_submission_assessment_id = ${assessmentId} AND state = 'claimed'
  `)
}

export async function completeTestCopyrightActionClaim(
  intentId: string,
  leaseToken: string,
  now: Date,
): Promise<void> {
  await using transaction = await beginTransaction()
  await completeCopyrightActionIntentInTransaction({
    intentId,
    leaseToken,
    completedAt: now,
    outcome: 'completed',
    query: transaction,
  })
  await transaction.commit()
}

export async function createTestRejectedCopyrightResponse(): Promise<string> {
  const user = await createTestUser()
  const intake = await createParsedCopyrightEmailIntake()
  const { responseId } = await rejectCopyrightEmailIntake({
    currentUser: { ...user, roles: ['moderator'] },
    intakeId: intake.id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    rationale: 'The message lacks required declarations.',
    responseKind: 'rejected',
    responseMessage: null,
  })
  if (!responseId) throw new Error('Response was not created')
  return responseId
}

/** Seeds unreadable persisted content without updating immutable response facts. */
export async function createTestUnreadableCopyrightResponse(): Promise<string> {
  const intake = await createParsedCopyrightEmailIntake()
  const id = uuidv7()
  const purpose = `copyright-email-intake-response:${id}`
  await write(sql`/* createTestUnreadableCopyrightResponse */
    INSERT INTO copyright_notice_email_intake_responses (
      id, copyright_notice_email_intake_id, response_kind, recipient_email_ciphertext,
      subject_ciphertext, body_ciphertext, idempotency_key
    ) VALUES (
      ${id}, ${intake.id}, 'rejected', ${encryptSecret('claimant@example.test', purpose)},
      ${'invalid-encrypted-response'}, ${encryptSecret('Response body', purpose)},
      ${`copyright-email-intake-response:${intake.id}`}
    )
  `)
  return id
}

export async function readTestCopyrightResponseFailure(responseId: string) {
  const { rows } = await read<{
    state: string
    lease_token: string | null
    claimed_at: Date | null
    delivery_attempt_count: number
    next_attempt_at: Date | null
    failure_ciphertext: string
  }>(sql`/* readTestCopyrightResponseFailure */
    SELECT state, lease_token, claimed_at, delivery_attempt_count, next_attempt_at, failure_ciphertext
    FROM copyright_notice_email_intake_responses WHERE id = ${responseId}
  `)
  const row = rows[0]!
  return {
    state: row.state,
    leaseToken: row.lease_token,
    claimedAt: row.claimed_at,
    attempts: row.delivery_attempt_count,
    nextAttemptAt: row.next_attempt_at,
    failure: decryptSecret(row.failure_ciphertext, `copyright-email-intake-response:${responseId}`),
  }
}
