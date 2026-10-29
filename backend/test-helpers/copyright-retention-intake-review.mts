import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'

/** Insert an owned immutable intake decision at an explicit time for retention-clock tests. */
export async function insertCopyrightRetentionIntakeReview(input: {
  intakeId: string
  sesMessageId: string
  reviewerId: string
  reviewedAt: Date
}) {
  await using transaction = await beginTransaction()
  await transaction(sql`/* insertCopyrightRetentionIntakeReview */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_receipt_id, reviewed_by_id, reviewed_at, decision, rationale_ciphertext
    ) VALUES (${input.intakeId}, ${input.reviewerId}, ${input.reviewedAt}, 'rejected',
      ${encryptSecret('The intake does not meet the filing requirements.', copyrightEmailIntakePurpose(input.sesMessageId))})`)
  await transaction(sql`/* insertCopyrightRetentionIntakeReview:current */
    UPDATE copyright_notice_email_intake_receipts SET
      review_decision = 'rejected', reviewed_at = ${input.reviewedAt},
      reviewed_by_id = ${input.reviewerId},
      review_rationale_ciphertext = ${encryptSecret('The intake does not meet the filing requirements.', copyrightEmailIntakePurpose(input.sesMessageId))}
    WHERE id = ${input.intakeId}`)
  await transaction.commit()
}
