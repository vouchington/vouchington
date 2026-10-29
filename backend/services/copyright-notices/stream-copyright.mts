import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { openCopyrightCiphertextSecretBatch } from './encryption-key-batch.mts'
import { getCopyrightRetentionWindows } from './config.mts'
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
export async function* streamCopyrightFiledNotices(
  userId: string,
  batchSize: number,
): CopyrightExportRows {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new RangeError('Copyright export batch size must be a positive safe integer')
  const pageSize = Math.min(batchSize, getCopyrightRetentionWindows().encryptionOwnerBatchSize)
  let after: string | undefined
  // Complete this user's export, committing and clearing key buffers before each bounded page yields.
  // oxlint-disable no-await-in-loop -- ordered keyset pages preserve complete user exports without holding key material across yields.
  while (true) {
    // no-mistakes-disable-next-line query-reached-per-item: complete per-user exports advance one configured bounded keyset page per call, releasing its transaction before yielding.
    const page = await readCopyrightFiledNoticePage(userId, after, pageSize)
    for (const row of page.exported) yield row
    if (page.exported.length < pageSize) return
    after = page.after
  }
  // oxlint-enable no-await-in-loop
}

async function readCopyrightFiledNoticePage(
  userId: string,
  after: string | undefined,
  pageSize: number,
): Promise<{ exported: Record<string, unknown>[]; after: string | undefined }> {
  await using transaction = await beginTransaction()
  const statement = sql`/* streamCopyrightFiledNotices */
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
    WHERE intake.requester_user_id = ${userId}`
  if (after) statement.append(sql` AND notice.id > ${after}::uuid`)
  statement.append(sql` ORDER BY notice.id LIMIT ${pageSize}`)
  const { rows } = await transaction<FiledNoticeRow>(statement)
  let exported: Record<string, unknown>[]
  {
    await using scopes = await openCopyrightCiphertextSecretBatch(
      rows.map(row => ({
        owner: { kind: 'notice' as const, id: row.notice_id },
        ciphertexts: [
          row.claimant_contact_ciphertext,
          row.electronic_signature_ciphertext,
          row.body_ciphertext,
        ],
      })),
      transaction,
    )
    exported = rows.map(row =>
      filedNoticeExportRow(
        row,
        scopes.forCiphertexts({ kind: 'notice', id: row.notice_id }, [
          row.claimant_contact_ciphertext,
          row.electronic_signature_ciphertext,
          row.body_ciphertext,
        ]),
      ),
    )
  }
  await transaction.commit()
  return { exported, after: rows.at(-1)?.notice_id }
}

/** Every copyright CSV in the export, with its file name; drained serially by `writeExportFiles`. */
export function streamCopyrightExports(
  userId: string,
  batchSize: number,
): Array<{ file: string; rows: CopyrightExportRows }> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new RangeError('Copyright export batch size must be a positive safe integer')
  return [
    { file: 'copyright-notices-filed.csv', rows: streamCopyrightFiledNotices(userId, batchSize) },
    { file: 'copyright-appeals.csv', rows: streamCopyrightAppeals(userId, batchSize) },
    {
      file: 'copyright-counter-notices.csv',
      rows: streamCopyrightCounterNotices(userId, batchSize),
    },
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
