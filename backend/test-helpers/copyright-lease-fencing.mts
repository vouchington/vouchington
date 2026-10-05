import { createTestUser } from './index.mts'
import { createParsedCopyrightEmailIntake } from '../services/copyright-notices/email-intake-test-fixtures.mts'
import { rejectCopyrightEmailIntake } from '../services/copyright-notices/email-rejection.mts'
import { beginTransaction, read, write } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { completeCopyrightActionIntentInTransaction } from '../services/copyright-notices/action-delivery-locking.mts'

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

/** Seeds an unreadable stored reply body without updating immutable intent facts. */
export async function createTestUnreadableCopyrightResponse(): Promise<string> {
  const intake = await createParsedCopyrightEmailIntake()
  const id = uuidv7()
  await write(sql`/* createTestUnreadableCopyrightResponse */
    INSERT INTO copyright_notice_delivery_work_items (
      id, copyright_notice_email_intake_id, recipient_role, delivery_kind, channel,
      idempotency_key, body_ciphertext
    ) VALUES (
      ${id}, ${intake.id}, 'correspondent', 'email_intake_rejected', 'email',
      ${`copyright-email-intake-response:${intake.id}`}, ${'invalid-encrypted-response'}
    )
  `)
  await write(sql`/* createTestUnreadableCopyrightResponse:recipient */
    INSERT INTO copyright_notice_delivery_recipients (
      copyright_notice_delivery_intent_id, email_ciphertext
    ) VALUES (
      ${id}, ${encryptSecret('claimant@example.test', `copyright-delivery-recipient:${id}`)}
    )
  `)
  return id
}

export async function readTestCopyrightResponseFailure(responseId: string) {
  const { rows } = await read<{
    state: string
    lease_token: string | null
    leased_at: Date | null
    attempt_count: number
    available_at: Date | null
    failure_ciphertext: string
  }>(sql`/* readTestCopyrightResponseFailure */
    SELECT state, lease_token, leased_at, attempt_count, available_at, failure_ciphertext
    FROM copyright_notice_delivery_work_items WHERE id = ${responseId}
  `)
  const row = rows[0]!
  return {
    state: row.state,
    leaseToken: row.lease_token,
    claimedAt: row.leased_at,
    attempts: row.attempt_count,
    nextAttemptAt: row.available_at,
    failure: decryptSecret(row.failure_ciphertext, `copyright-delivery:${responseId}`),
  }
}

export async function readTestCopyrightDeliveryIntentState(intentId: string): Promise<string> {
  const { rows } = await read<{ state: string }>(sql`/* readTestCopyrightDeliveryIntentState */
    SELECT state FROM copyright_notice_delivery_work_items WHERE id = ${intentId}
  `)
  return rows[0]!.state
}
