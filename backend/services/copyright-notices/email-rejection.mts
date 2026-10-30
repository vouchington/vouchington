import { openCopyrightOwnerSecretBatch } from './encryption-key-batch.mts'
import {
  prepareCopyrightEmailDecisionKeys,
  attachCopyrightEncryptionKey,
  type PreparedCopyrightEncryptionKey,
} from './encryption-keys.mts'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql/types'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from './email-intake-reply.mts'
import { assertCopyrightEmailUnresolvedReply } from './email-thread-review-path.mts'
import {
  validateCopyrightEmailRejection,
  type CopyrightEmailRejectionInput,
} from './email-rejection-validation.mts'

/**
 * Records a staff rejection or needs-information decision and queues the sender's reply.
 *
 * With a succeeded parse the reply goes to the parsed sender, and a typed `replyEmail` is a 422:
 * the parse may have landed after staff opened the intake, and a silently ignored address would
 * send a legal communication somewhere staff never chose. Without one, the reply goes to the
 * typed `replyEmail`, and with no address nothing is queued. A parse that lands after the decision
 * sends nothing, because a response exists only when this call creates it.
 *
 * `responseId` is set only when this call created the reply, so the caller enqueues its delivery
 * once. `replyQueued` also reports an earlier identical decision's reply on an exact replay.
 */
export async function rejectCopyrightEmailIntake(
  input: CopyrightEmailRejectionInput,
): Promise<{ responseId: string | null; replyQueued: boolean }> {
  const replyEmail = validateCopyrightEmailRejection(input)
  await using preparedKeys = await prepareCopyrightEmailDecisionKeys(input.intakeId, false)
  return await rejectWithPreparedKeys(input, replyEmail, preparedKeys.intake, preparedKeys.receipt)
}

async function rejectWithPreparedKeys(
  input: Parameters<typeof rejectCopyrightEmailIntake>[0],
  replyEmail: string | null,
  preparedIntakeKey: PreparedCopyrightEncryptionKey | null,
  preparedReceiptKey: PreparedCopyrightEncryptionKey | null,
): Promise<{ responseId: string | null; replyQueued: boolean }> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    amazon_ses_message_id: string
    parsed_sender_ciphertext: string | null
  }>(sql`/* rejectCopyrightEmailIntake:lock */
    SELECT intake.amazon_ses_message_id, parse.sender_email_ciphertext AS parsed_sender_ciphertext
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
    LEFT JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
    WHERE intake.id = ${input.intakeId} AND intake.raw_storage_object_id IS NOT NULL
      AND receipt.erased_at IS NULL
    FOR UPDATE OF intake, receipt
  `)
  const intake = rows[0]
  assert(intake, 404, 'Copyright email intake not found')
  await assertNoInitialIntakeThreadBarrier(transaction, input.intakeId)
  await assertRecommendationScope(transaction, input.recommendationId, input.intakeId)
  const { rows: decisions } = await transaction<{ decision: string; response_id: string | null }>(
    sql`/* rejectCopyrightEmailIntake:existing */
      SELECT receipt.review_decision AS decision, response.id AS response_id
      FROM copyright_notice_email_intake_receipts receipt
      LEFT JOIN copyright_notice_delivery_work_items response
        ON response.copyright_notice_email_intake_receipt_id = receipt.id
        AND response.delivery_kind IN ('email_intake_rejected', 'email_intake_needs_information')
      WHERE receipt.id = ${input.intakeId} AND receipt.review_decision IS NOT NULL`,
  )
  const decision = decisions[0]
  assert(decision?.decision !== 'approved', 409, 'Copyright email intake was already approved')
  assert(decision?.decision !== 'legal_process', 409, 'Copyright email intake is legal process')
  if (decision) {
    await transaction.commit()
    return { responseId: null, replyQueued: decision.response_id !== null }
  }
  if (preparedIntakeKey)
    await attachCopyrightEncryptionKey(
      preparedIntakeKey,
      { kind: 'intake', id: input.intakeId },
      transaction,
    )
  if (preparedReceiptKey)
    await attachCopyrightEncryptionKey(
      preparedReceiptKey,
      { kind: 'receipt', id: input.intakeId },
      transaction,
    )
  await using ownerScopes = await openCopyrightOwnerSecretBatch(
    [
      { kind: 'intake', id: input.intakeId },
      { kind: 'receipt', id: input.intakeId },
    ],
    transaction,
  )
  const { decryptSecret } = ownerScopes.get({ kind: 'intake', id: input.intakeId })
  const receiptSecrets = ownerScopes.get({ kind: 'receipt', id: input.intakeId })
  const parsedSender = intake.parsed_sender_ciphertext
    ? decryptSecret(
        intake.parsed_sender_ciphertext,
        copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
      )
    : null
  assert(
    !(parsedSender && replyEmail),
    422,
    'reply_email is only accepted while the intake has no parsed sender',
  )
  const rationaleCiphertext = receiptSecrets.encryptSecret(
    JSON.stringify({
      rationale: input.rationale,
      manual_fallback_reason: input.manualFallbackReason,
    }),
    copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
  )
  await transaction(sql`/* rejectCopyrightEmailIntake */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_receipt_id, copyright_notice_email_intake_recommendation_id,
      reviewed_at, reviewed_by_id, decision, rationale_ciphertext
    ) VALUES (
      ${input.intakeId}, ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id},
      'rejected', ${rationaleCiphertext}
    )
  `)
  await transaction(sql`/* rejectCopyrightEmailIntake:currentDecision */
    UPDATE copyright_notice_email_intake_receipts SET
      review_decision = 'rejected', reviewed_at = CURRENT_TIMESTAMP,
      reviewed_by_id = ${input.currentUser.id},
      review_rationale_ciphertext = ${rationaleCiphertext}
    WHERE id = ${input.intakeId}`)
  const recipientEmail = parsedSender ?? replyEmail
  const response = recipientEmail
    ? await createCopyrightEmailIntakeResponseInTransaction(
        {
          intakeId: input.intakeId,
          recipientEmail,
          responseKind: input.responseKind ?? 'rejected',
          responseMessage: input.responseMessage ?? null,
        },
        transaction,
        ownerScopes,
      )
    : null
  await transaction.commit()
  return { responseId: response, replyQueued: response !== null }
}

export async function assertNoInitialIntakeThreadBarrier(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  await assertCopyrightEmailUnresolvedReply(transaction, intakeId)
  await assertNoThreadCorrespondenceDecision(transaction, intakeId)
}

async function assertNoThreadCorrespondenceDecision(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  const { rows } = await transaction(sql`/* rejectCopyrightEmailIntake:threadReview */
    SELECT 1
    FROM copyright_notice_email_intake_notice_links link
    WHERE link.copyright_notice_email_intake_receipt_id = ${intakeId}
      AND link.link_kind = 'thread'
    UNION ALL
    SELECT 1
    FROM copyright_notice_email_intake_notice_links decided_link
    WHERE decided_link.copyright_notice_email_intake_receipt_id = ${intakeId}
      AND decided_link.correspondence_action IN ('admitted', 'rejected')
    LIMIT 1
  `)
  assert(!rows[0], 409, 'Thread-linked copyright email cannot be rejected as an initial intake')
}

async function assertRecommendationScope(
  transaction: TransactionQuery,
  recommendationId: string | null,
  intakeId: string,
): Promise<void> {
  if (!recommendationId) return
  const { rows } = await transaction<{ id: string }>(
    sql`/* rejectCopyrightEmailIntake:recommendation */
      SELECT id FROM copyright_notice_email_intake_recommendation_identities
      WHERE id = ${recommendationId} AND copyright_notice_email_intake_receipt_id = ${intakeId}`,
  )
  assert(rows[0], 422, 'Email recommendation does not belong to this intake')
}
