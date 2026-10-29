import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { openCopyrightCiphertextSecretBatch } from './encryption-key-batch.mts'
import { getCopyrightRetentionWindows } from './config.mts'
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
export async function* streamCopyrightAppeals(
  userId: string,
  batchSize: number,
): CopyrightExportRows {
  for await (const { ids, body } of streamOwnSubmissions<AppealBody>(userId, 'appeal', batchSize)) {
    yield appealExportRow(ids, body)
  }
}

/** Streams the counter-notices the user submitted as a signed-in poster, decrypted in full. */
export async function* streamCopyrightCounterNotices(
  userId: string,
  batchSize: number,
): CopyrightExportRows {
  for await (const { ids, body } of streamOwnSubmissions<CounterNoticeBody>(
    userId,
    'counter_notice',
    batchSize,
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
  batchSize: number,
): AsyncGenerator<OwnSubmission<Body>> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new RangeError('Copyright export batch size must be a positive safe integer')
  const pageSize = Math.min(batchSize, getCopyrightRetentionWindows().encryptionOwnerBatchSize)
  let after: string | undefined
  // oxlint-disable no-await-in-loop -- complete user exports consume bounded keyset pages after each page transaction and key scope closes.
  while (true) {
    // no-mistakes-disable-next-line query-reached-per-item: complete per-user exports advance one configured bounded keyset page per call, releasing its transaction before yielding.
    const page = await readOwnSubmissionPage<Body>(userId, kind, after, pageSize)
    yield* page.exported
    if (page.exported.length < pageSize) return
    after = page.after
  }
  // oxlint-enable no-await-in-loop
}

async function readOwnSubmissionPage<Body>(
  userId: string,
  kind: 'appeal' | 'counter_notice',
  after: string | undefined,
  pageSize: number,
): Promise<{ exported: OwnSubmission<Body>[]; after: string | undefined }> {
  await using transaction = await beginTransaction()
  const statement = sql`/* streamCopyrightSubmissions */
    SELECT submission.id AS submission_id, submission.copyright_notice_id AS notice_id,
      submission.received_at, submission.body_ciphertext
    FROM copyright_notice_submissions submission
    WHERE submission.submitted_by_id = ${userId}
      AND submission.source_kind = 'signed_in_form' AND submission.kind = ${kind}`
  if (after) statement.append(sql` AND submission.id > ${after}::uuid`)
  statement.append(sql` ORDER BY submission.id LIMIT ${pageSize}`)
  const { rows } = await transaction<SubmissionIds & { body_ciphertext: string }>(statement)
  let exported: OwnSubmission<Body>[]
  {
    await using scopes = await openCopyrightCiphertextSecretBatch(
      rows.map(row => ({
        owner: { kind: 'notice' as const, id: row.notice_id },
        ciphertexts: [row.body_ciphertext],
      })),
      transaction,
    )
    exported = rows.map(row => ({
      ids: {
        submission_id: row.submission_id,
        notice_id: row.notice_id,
        received_at: row.received_at,
      },
      body: decryptExportedCopyrightJson<Body>(
        row.body_ciphertext,
        `copyright-submission:${row.submission_id}`,
        scopes.forCiphertexts({ kind: 'notice', id: row.notice_id }, [row.body_ciphertext]),
      ),
    }))
  }
  await transaction.commit()
  return { exported, after: rows.at(-1)?.submission_id }
}
