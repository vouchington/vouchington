import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { assertNoInitialIntakeThreadBarrier } from './email-rejection.mts'

export const COPYRIGHT_EMAIL_LEGAL_PROCESS_REASON_MAX_LENGTH = 1_000

/**
 * Records that an initial email intake is legal process, such as a §512(h) subpoena, and closes it
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
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ amazon_ses_message_id: string }>(
    sql`/* recordCopyrightEmailIntakeLegalProcess:lock */
      SELECT amazon_ses_message_id FROM copyright_notice_email_intakes
      WHERE id = ${input.intakeId}
      FOR UPDATE`,
  )
  const intake = rows[0]
  assert(intake, 404, 'Copyright email intake not found')
  await assertNoInitialIntakeThreadBarrier(transaction, input.intakeId)
  const { rows: decisions } = await transaction(
    sql`/* recordCopyrightEmailIntakeLegalProcess:existing */
      SELECT 1 FROM copyright_notice_email_intake_reviews
      WHERE copyright_notice_email_intake_id = ${input.intakeId}`,
  )
  assert(!decisions[0], 409, 'Copyright email intake was already decided')
  await transaction(sql`/* recordCopyrightEmailIntakeLegalProcess */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_id, reviewed_at, reviewed_by_id, decision, rationale_ciphertext
    ) VALUES (
      ${input.intakeId}, CURRENT_TIMESTAMP, ${input.currentUser.id}, 'legal_process',
      ${encryptSecret(
        JSON.stringify({ rationale: reason, manual_fallback_reason: null }),
        copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
      )}
    )
  `)
  await transaction.commit()
}
