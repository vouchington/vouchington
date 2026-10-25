import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  CopyrightNoticeSubmissionRecord,
  CopyrightSubmissionKind,
  CopyrightSubmissionSourceKind,
} from '../services/copyright-notices/types.mts'

export async function appendTestCopyrightNoticeSubmission(input: {
  noticeId: string
  kind: CopyrightSubmissionKind
  receivedAt: Date
  sourceKind: CopyrightSubmissionSourceKind
  submittedByUserId: string | null
  bodyCiphertext: string
}): Promise<CopyrightNoticeSubmissionRecord> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* appendCopyrightNoticeSubmission:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE
  `)
  const { rows } =
    await transaction<CopyrightNoticeSubmissionRecord>(sql`/* appendCopyrightNoticeSubmission */
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext
      ) VALUES (
        ${input.noticeId}, ${input.kind}, ${input.receivedAt}, ${input.sourceKind}, ${input.submittedByUserId}, ${input.bodyCiphertext}
      )
      RETURNING id, copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext
    `)
  const submission = rows[0]
  if (!submission) throw new Error('Failed to append copyright notice submission')
  await transaction.commit()
  return submission
}
