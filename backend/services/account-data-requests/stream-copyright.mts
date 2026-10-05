import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { streamCopyrightCases } from './stream-copyright-cases.mts'
import {
  streamCopyrightRepeatInfringerIncidents,
  streamCopyrightRepeatInfringerReviews,
} from './stream-copyright-incidents.mts'
import { type FiledNoticeRow, filedNoticeExportRow } from './stream-copyright-rows.mts'
import {
  streamCopyrightAppeals,
  streamCopyrightCounterNotices,
} from './stream-copyright-submissions.mts'

type CopyrightExportRows = AsyncGenerator<Record<string, unknown>>

/**
 * Streams the notices the user filed as a signed-in claimant, decrypted in full: legal name,
 * contact, work description, statements, signature and the target references as submitted. Text
 * the retention sweep has erased reads as an explicit erased marker, not as a failure.
 */
export async function* streamCopyrightFiledNotices(userId: string): CopyrightExportRows {
  for await (const row of createAsyncGeneratorFromCursor<FiledNoticeRow>(
    sql`/* streamCopyrightFiledNotices */
    SELECT notice.id AS notice_id, notice.received_at, notice.jurisdiction,
      notice.claimant_display_name, notice.claimant_contact_ciphertext, notice.work_description,
      intake.idempotency_key, intake.has_good_faith_belief,
      intake.has_accuracy_authority_under_penalty_of_perjury, intake.electronic_signature_ciphertext,
      submission.body_ciphertext,
      (SELECT erasure.created_at FROM copyright_notice_retention_erasures erasure
        WHERE erasure.copyright_notice_id = notice.id) AS erased_by_retention_at
    FROM copyright_notice_form_intakes intake
    JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
    JOIN copyright_notice_submissions submission
      ON submission.id = intake.copyright_notice_submission_id
    WHERE intake.requester_user_id = ${userId}
    ORDER BY notice.id
  `,
  )) {
    yield filedNoticeExportRow(row)
  }
}

/** Every copyright CSV in the export, with its file name; drained serially by `writeExportFiles`. */
export function streamCopyrightExports(
  userId: string,
): Array<{ file: string; rows: CopyrightExportRows }> {
  return [
    { file: 'copyright-notices-filed.csv', rows: streamCopyrightFiledNotices(userId) },
    { file: 'copyright-appeals.csv', rows: streamCopyrightAppeals(userId) },
    { file: 'copyright-counter-notices.csv', rows: streamCopyrightCounterNotices(userId) },
    { file: 'copyright-cases.csv', rows: streamCopyrightCases(userId) },
    {
      file: 'copyright-repeat-infringer-incidents.csv',
      rows: streamCopyrightRepeatInfringerIncidents(userId),
    },
    {
      file: 'copyright-repeat-infringer-reviews.csv',
      rows: streamCopyrightRepeatInfringerReviews(userId),
    },
  ]
}
