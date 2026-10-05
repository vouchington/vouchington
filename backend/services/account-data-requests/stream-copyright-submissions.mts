import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptExportedCopyrightJson } from './stream-copyright-erased.mts'
import {
  type AppealBody,
  type CounterNoticeBody,
  type SubmissionIds,
  appealExportRow,
  counterNoticeExportRow,
} from './stream-copyright-rows.mts'

type CopyrightExportRows = AsyncGenerator<Record<string, unknown>>

type OwnSubmission<Body> = { ids: SubmissionIds; body: Body | null }

/** Streams the appeals the user submitted as a signed-in poster, with their stated reason. */
export async function* streamCopyrightAppeals(userId: string): CopyrightExportRows {
  for await (const { ids, body } of streamOwnSubmissions<AppealBody>(userId, 'appeal')) {
    yield appealExportRow(ids, body)
  }
}

/** Streams the counter-notices the user submitted as a signed-in poster, decrypted in full. */
export async function* streamCopyrightCounterNotices(userId: string): CopyrightExportRows {
  for await (const { ids, body } of streamOwnSubmissions<CounterNoticeBody>(
    userId,
    'counter_notice',
  )) {
    yield counterNoticeExportRow(ids, body)
  }
}

/**
 * Only the user's own signed-in form submissions: staff-recorded submissions carry the staff
 * member's id in `submitted_by_id`, so the source filter keeps a moderator's export free of
 * other people's filings. A body the retention sweep erased comes back as null.
 */
async function* streamOwnSubmissions<Body>(
  userId: string,
  kind: 'appeal' | 'counter_notice',
): AsyncGenerator<OwnSubmission<Body>> {
  for await (const row of createAsyncGeneratorFromCursor<
    SubmissionIds & { body_ciphertext: string }
  >(sql`/* streamCopyrightSubmissions */
    SELECT submission.id AS submission_id, submission.copyright_notice_id AS notice_id,
      submission.received_at, submission.body_ciphertext
    FROM copyright_notice_submissions submission
    WHERE submission.submitted_by_id = ${userId}
      AND submission.source_kind = 'signed_in_form' AND submission.kind = ${kind}
    ORDER BY submission.id
  `)) {
    yield {
      ids: {
        submission_id: row.submission_id,
        notice_id: row.notice_id,
        received_at: row.received_at,
      },
      body: decryptExportedCopyrightJson<Body>(
        row.body_ciphertext,
        `copyright-submission:${row.submission_id}`,
      ),
    }
  }
}
