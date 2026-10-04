import { read } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** A stored result that existed when the reviewer made this decision. */
export async function copyrightSubmissionHasGuidance(
  submissionId: string,
  query: TransactionQuery,
): Promise<boolean> {
  const { rows } = await query<{ assisted: boolean }>(sql`
    /* copyrightSubmissionHasGuidance */
    SELECT EXISTS (
      SELECT 1 FROM copyright_notice_submission_guidance guidance
      WHERE guidance.copyright_notice_submission_id = ${submissionId}
    ) AS assisted
  `)
  return rows[0]?.assisted ?? false
}

/** Only a reviewed counter-notice decision may disclose assistance in a status update. */
export async function copyrightInAppDecisionWasAiAssisted(intentId: string): Promise<boolean> {
  const { rows } = await read<{ assisted: boolean }>(sql`
    /* copyrightInAppDecisionWasAiAssisted */
    SELECT EXISTS (
      SELECT 1 FROM copyright_notice_delivery_intents intent
      JOIN copyright_notice_counter_notice_reviews review
        ON review.copyright_notice_submission_id = intent.copyright_notice_submission_id
      JOIN copyright_notice_submission_guidance guidance
        ON guidance.copyright_notice_submission_id = review.copyright_notice_submission_id
      WHERE intent.id = ${intentId}
        AND intent.delivery_kind = 'status_update'
        AND intent.recipient_role = 'poster'
        AND review.id <= intent.id
        AND guidance.id <= review.id
    ) AS assisted
  `)
  return rows[0]?.assisted ?? false
}
