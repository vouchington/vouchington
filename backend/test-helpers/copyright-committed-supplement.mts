import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import type { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import {
  insertAdmittedCopyrightEmailSubmission,
  type AdmittedEmailCorrespondencePending,
} from '../services/copyright-notices/email-correspondence-admission-submission.mts'
import { recordAdmittedCopyrightCorrespondenceReview } from '../services/copyright-notices/email-correspondence-review.mts'

/** Commit the producer's canonical supplement facts before testing nonwriting replay. */
export async function seedCommittedCopyrightSupplement(
  input: Parameters<typeof admitCopyrightEmailCorrespondence>[0],
) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<AdmittedEmailCorrespondencePending>(sql`
    /* seedCommittedCopyrightSupplement:source */
    SELECT intake.id, intake.amazon_ses_message_id, intake.received_at,
      intake.raw_storage_object_id, intake.raw_sha256, intake.raw_media_type_id,
      intake.raw_byte_size, link.copyright_notice_id AS notice_id, parse.body_ciphertext
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id
    JOIN copyright_notice_email_intake_parses parse ON parse.copyright_notice_email_intake_id = intake.id
    WHERE intake.id = ${input.intakeId} AND parse.status = 'succeeded'`)
  const pending = rows[0]
  if (!pending || input.kind !== 'supplement') throw new Error('Owned supplement source is missing')
  const correspondenceId = uuidv7()
  await transaction(sql`/* seedCommittedCopyrightSupplement:event */
    INSERT INTO copyright_notice_lifecycle_changes
      (copyright_notice_id, change_type, changed_by_id, copyright_notice_correspondence_id)
    VALUES (${pending.notice_id}, 'email_correspondence_admitted', ${input.currentUser.id}, ${correspondenceId})`)
  const { submissionId } = await insertAdmittedCopyrightEmailSubmission(
    transaction,
    input,
    pending,
    correspondenceId,
  )
  const purpose = copyrightEmailIntakePurpose(pending.amazon_ses_message_id)
  await recordAdmittedCopyrightCorrespondenceReview(transaction, {
    input,
    noticeId: pending.notice_id,
    submissionId,
    correspondenceId,
    rationaleCiphertext: encryptSecret(input.rationale, purpose),
    manualFallbackCiphertext: input.manualFallbackReason
      ? encryptSecret(input.manualFallbackReason, purpose)
      : null,
  })
  await transaction.commit()
  return { noticeId: pending.notice_id, submissionId, correspondenceId, isDuplicate: false }
}
