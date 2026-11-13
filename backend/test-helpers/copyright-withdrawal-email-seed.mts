import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import {
  insertAdmittedCopyrightEmailSubmission,
  type AdmittedEmailCorrespondencePending,
} from '../services/copyright-notices/email-correspondence-admission-submission.mts'
import { recordAdmittedCopyrightCorrespondenceReview } from '../services/copyright-notices/email-correspondence-review.mts'
import type { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { recordClaimantMisuseEvent } from '../services/copyright-notices/claimant-misuse-ledger.mts'
import { revokeCopyrightGuestCapabilitiesForWithdrawal } from '../services/copyright-notices/guest-capability-withdrawal.mts'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'

/** A complete committed email withdrawal, immutable source review, current link, misuse and token revocations precede guards. */
export async function seedCommittedEmailWithdrawal(
  input: Parameters<typeof admitCopyrightEmailCorrespondence>[0],
) {
  if (input.kind !== 'withdrawal') throw new Error('Withdrawal fixture requires a withdrawal')
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<AdmittedEmailCorrespondencePending>(sql`/* seedCommittedEmailWithdrawal:pending */
    SELECT intake.id, intake.amazon_ses_message_id, intake.received_at, intake.raw_storage_object_id,
      intake.raw_sha256, intake.raw_media_type_id, intake.raw_byte_size,
      link.copyright_notice_id AS notice_id, parse.body_ciphertext
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id AND link.link_kind = 'thread'
    JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
    WHERE intake.id = ${input.intakeId} AND link.correspondence_action = 'pending'`)
  const pending = rows[0]
  if (!pending) throw new Error('Owned retained guest complaint email was not pending')
  const correspondenceId = uuidv7()
  await transaction(sql`/* seedCommittedEmailWithdrawal:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_correspondence_id) VALUES (${pending.notice_id}, 'email_correspondence_admitted',
        ${input.currentUser.id}, ${correspondenceId})`)
  const admitted = await insertAdmittedCopyrightEmailSubmission(
    transaction,
    input,
    pending,
    correspondenceId,
  )
  const purpose = copyrightEmailIntakePurpose(pending.amazon_ses_message_id)
  await recordAdmittedCopyrightCorrespondenceReview(transaction, {
    input,
    noticeId: pending.notice_id,
    submissionId: admitted.submissionId,
    correspondenceId,
    rationaleCiphertext: encryptSecret(input.rationale, purpose),
    manualFallbackCiphertext: input.manualFallbackReason
      ? encryptSecret(input.manualFallbackReason, purpose)
      : null,
  })
  await recordClaimantMisuseEvent(transaction, {
    noticeId: pending.notice_id,
    event: { outcome: 'notice_withdrawn', submissionId: admitted.submissionId },
  })
  await revokeCopyrightGuestCapabilitiesForWithdrawal(transaction, {
    noticeId: pending.notice_id,
    revokedAt: new Date(),
  })
  await readCopyrightThreadRetirement(transaction, [pending.notice_id])
  await transaction.commit()
  return { ...admitted, noticeId: pending.notice_id, isDuplicate: false }
}
