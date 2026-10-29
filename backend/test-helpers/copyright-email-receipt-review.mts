import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Reads only the retained receipt so a test cannot accidentally depend on review history. */
export async function readCopyrightEmailReceiptReview(intakeId: string) {
  const { rows } = await read<{
    amazon_ses_message_id: string
    review_decision: string | null
    reviewed_by_id: string | null
    review_rationale_ciphertext: string | null
  }>(sql`/* readCopyrightEmailReceiptReview */
    SELECT amazon_ses_message_id, review_decision, reviewed_by_id,
      review_rationale_ciphertext
    FROM copyright_notice_email_intake_receipts
    WHERE id = ${intakeId}`)
  return rows[0] ?? null
}
