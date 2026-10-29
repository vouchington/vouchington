import { createTestUser } from './index.mts'
import { createParsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'
import { rejectCopyrightEmailIntake } from '../services/copyright-notices/email-rejection.mts'
import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { openCopyrightSecrets } from '../services/copyright-notices/encryption-keys.mts'
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
  await using transaction = await beginTransaction()
  await using secrets = await openCopyrightSecrets(
    { kind: 'intake', id: intake.id },
    transaction,
    'write',
  )
  await transaction(sql`/* createTestUnreadableCopyrightResponse */
    INSERT INTO copyright_notice_delivery_work_items (
      id, copyright_notice_email_intake_receipt_id, recipient_role, delivery_kind, channel,
      idempotency_key, body_ciphertext
    ) VALUES (
      ${id}, ${intake.id}, 'correspondent', 'email_intake_rejected', 'email',
      ${`copyright-email-intake-response:${intake.id}`}, ${'invalid-encrypted-response'}
    )
  `)
  await transaction(sql`/* createTestUnreadableCopyrightResponse:recipient */
    INSERT INTO copyright_notice_delivery_recipients (
      copyright_notice_delivery_work_item_id, email_ciphertext
    ) VALUES (
      ${id}, ${secrets.encryptSecret('claimant@example.test', `copyright-delivery-recipient:${id}`)}
    )
  `)
  await transaction.commit()
  return id
}

export async function readTestCopyrightResponseFailure(responseId: string) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
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
  const row = rows[0]
  if (!row) throw new Error('Copyright response failure fixture missing')
  await using secrets = await openCopyrightSecrets(
    { kind: 'delivery', id: responseId },
    transaction,
  )
  const result = {
    state: row.state,
    leaseToken: row.lease_token,
    claimedAt: row.leased_at,
    attempts: row.attempt_count,
    nextAttemptAt: row.available_at,
    failure: secrets.decryptSecret(row.failure_ciphertext, `copyright-delivery:${responseId}`),
  }
  await transaction.commit()
  return result
}

export async function readTestCopyrightDeliveryIntentState(intentId: string): Promise<string> {
  const { rows } = await read<{ state: string }>(sql`/* readTestCopyrightDeliveryIntentState */
    SELECT state FROM copyright_notice_delivery_work_items WHERE id = ${intentId}
  `)
  return rows[0]!.state
}
