import { write } from '@data-stores/psql'
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
  await write(sql`/* insertCopyrightRetentionIntakeReview */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_id, reviewed_by_id, reviewed_at, decision, rationale_ciphertext
    ) VALUES (${input.intakeId}, ${input.reviewerId}, ${input.reviewedAt}, 'rejected',
      ${encryptSecret('The intake does not meet the filing requirements.', copyrightEmailIntakePurpose(input.sesMessageId))})`)
}
