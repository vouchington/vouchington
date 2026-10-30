import {
  prepareCopyrightReceiptEncryptionKey,
  attachCopyrightEncryptionKey,
  openCopyrightSecrets,
} from './encryption-keys.mts'
import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { assertNoInitialIntakeThreadBarrier } from './email-rejection.mts'

const COPYRIGHT_EMAIL_LEGAL_PROCESS_REASON_MAX_LENGTH = 1_000

/**
 * Records that a separate-case email intake is legal process, such as a §512(h) subpoena, and closes it
 * without telling the sender.
 *
 * The decision is the intake's one review row: it records who decided and when, and the reason
 * encrypted like a review rationale. It is not an approval or a rejection, so it queues no reply
 * and no email of any kind, and creates no case, assessment, restriction, or lifecycle event. The
 * row removes the intake from the staff queue and the review-target sweep, which count only
 * undecided intakes. Any prior decision, including an earlier legal-process one, is a 409.
 *
 * The reason may name a legal matter. It is encrypted before it is stored and never reaches a log
 * line or an error message.
 */
export async function recordCopyrightEmailIntakeLegalProcess(input: {
  currentUser: PrivateUser
  intakeId: string
  reason: string
}): Promise<void> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  const reason = input.reason.trim()
  assert(reason, 422, 'Legal process reason is required')
  assert(
    reason.length <= COPYRIGHT_EMAIL_LEGAL_PROCESS_REASON_MAX_LENGTH,
    422,
    'Legal process reason is too long',
  )
  await using preparedKey = await prepareCopyrightReceiptEncryptionKey(input.intakeId)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ amazon_ses_message_id: string }>(
    sql`/* recordCopyrightEmailIntakeLegalProcess:lock */
      SELECT intake.amazon_ses_message_id FROM copyright_notice_email_intakes intake
      JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
      WHERE intake.id = ${input.intakeId} AND intake.raw_storage_object_id IS NOT NULL
        AND receipt.erased_at IS NULL
      FOR UPDATE OF intake, receipt`,
  )
  const intake = rows[0]
  assert(intake, 404, 'Copyright email intake not found')
  await assertNoInitialIntakeThreadBarrier(transaction, input.intakeId)
  const { rows: decisions } = await transaction(
    sql`/* recordCopyrightEmailIntakeLegalProcess:existing */
      SELECT 1 FROM copyright_notice_email_intake_receipts
      WHERE id = ${input.intakeId} AND review_decision IS NOT NULL`,
  )
  assert(!decisions[0], 409, 'Copyright email intake was already decided')
  if (preparedKey)
    await attachCopyrightEncryptionKey(
      preparedKey,
      { kind: 'receipt', id: input.intakeId },
      transaction,
    )
  await using secrets = await openCopyrightSecrets(
    { kind: 'receipt', id: input.intakeId },
    transaction,
    'write',
  )
  const rationaleCiphertext = secrets.encryptSecret(
    JSON.stringify({ rationale: reason, manual_fallback_reason: null }),
    copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
  )
  await recordCopyrightLegalProcessReview(
    transaction,
    input.intakeId,
    input.currentUser.id,
    rationaleCiphertext,
  )
  await transaction.commit()
}

/** The finite review and retained receipt result are one ordered transaction unit. */
async function recordCopyrightLegalProcessReview(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  intakeId: string,
  reviewerId: string,
  rationaleCiphertext: string,
): Promise<void> {
  await transaction(sql`/* recordCopyrightEmailIntakeLegalProcess */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_receipt_id, reviewed_at, reviewed_by_id, decision, rationale_ciphertext
    ) VALUES (
      ${intakeId}, CURRENT_TIMESTAMP, ${reviewerId}, 'legal_process',
      ${rationaleCiphertext}
    )
  `)
  await transaction(sql`/* recordCopyrightEmailIntakeLegalProcess:currentDecision */
    UPDATE copyright_notice_email_intake_receipts SET
      review_decision = 'legal_process', reviewed_at = CURRENT_TIMESTAMP,
      reviewed_by_id = ${reviewerId},
      review_rationale_ciphertext = ${rationaleCiphertext}
    WHERE id = ${intakeId}`)
}
